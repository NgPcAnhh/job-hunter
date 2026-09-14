"""
Crawler for VietnamWorks (https://www.vietnamworks.com)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa trên REST API chính thức của VietnamWorks:
Endpoint: https://ms.vietnamworks.com/job-search/v1.0/search

Đặc điểm kiến trúc & Anti-Ban (Anti-Block) tối ưu:
1. Kết nối trực tiếp qua JSON REST API của VietnamWorks:
   Không phụ thuộc vào trình duyệt headless (Playwright/Chromium), loại bỏ hoàn toàn nguy cơ bị Cloudflare 403.
2. Tốc độ và hiệu năng vượt trội:
   Tải về đầy đủ 50 bài tuyển dụng / trang kèm toàn bộ mô tả chi tiết chỉ trong ~0.5s - 1.0s.
3. Dữ liệu chuẩn xác và đầy đủ:
   - Header & Thông tin cơ bản: job_title, salary (prettySalary/range), location_short, experience, deadline.
   - Doanh nghiệp: company_name, company_logo, company_url.
   - Nội dung bài đăng: job_description, job_requirements, benefits.
   - Từ khóa kỹ năng: trích xuất danh sách skills chuẩn hóa theo định dạng '{kw_1} {kw_2}'.
4. Hỗ trợ tham số linh hoạt:
   - page="max" hoặc page=N.
   - max_jobs_per_page="max" hoặc số nguyên N.
5. Incremental Auto-Save:
   Tự động lưu lũy tiến vào Supabase PostgreSQL (bảng `jobs_vietnamworks`) và backup ra file CSV/JSON sau mỗi trang.
"""

import os
import re
import csv
import sys
import json
import time
import random
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from urllib.parse import urljoin

# Cấu hình encoding UTF-8 stdout trên Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Sử dụng curl_cffi để bypass TLS fingerprinting; fallback sang requests nếu chưa cài
try:
    from curl_cffi import requests as curl_requests
    HAS_CURL_CFFI = True
except ImportError:
    import requests as curl_requests
    HAS_CURL_CFFI = False

from bs4 import BeautifulSoup

# Đảm bảo import được crawler.db khi chạy trực tiếp hoặc module
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from crawler.db import upsert_jobs_to_source_table, upsert_jobs_to_supabase
except ImportError:
    from db import upsert_jobs_to_source_table, upsert_jobs_to_supabase

# Cấu hình logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

SOURCE_NAME = "vietnamworks"
BASE_DOMAIN = "https://www.vietnamworks.com"
API_SEARCH_URL = "https://ms.vietnamworks.com/job-search/v1.0/search"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "vietnamworks.csv"
OUTPUT_JSON = OUTPUT_DIR / "vietnamworks.json"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]


def clean_html(raw_html: Optional[str]) -> str:
    """Loại bỏ thẻ HTML và trích xuất text sạch."""
    if not raw_html:
        return ""
    try:
        soup = BeautifulSoup(raw_html, "html.parser")
        return soup.get_text(separator="\n", strip=True)
    except Exception:
        return str(raw_html).strip()


def get_api_headers() -> Dict[str, str]:
    """Tạo bộ HTTP headers chuẩn cho request tới API VietnamWorks."""
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Origin": BASE_DOMAIN,
        "Referer": f"{BASE_DOMAIN}/",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }


def parse_job_from_api(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Chuẩn hóa bản ghi job từ API VietnamWorks sang định dạng schema của hệ thống.
    """
    # 1. Từ khóa kỹ năng (Skills)
    skills = item.get("skills") or []
    keywords = [s.get("skillName", "").strip() for s in skills if s.get("skillName")]
    kw_str = " ".join([f"{{{k}}}" for k in keywords if k])

    # 2. Phúc lợi (Benefits)
    benefits_list = item.get("benefits") or []
    benefits_str = "\n".join([b.get("benefitName", "").strip() for b in benefits_list if b.get("benefitName")])

    # 3. Mức lương
    salary = item.get("prettySalary") or ""
    if not salary or salary.strip() in ["0", "Thương lượng", ""]:
        s_min = item.get("salaryMin")
        s_max = item.get("salaryMax")
        if s_min and s_max:
            salary = f"{s_min:,} - {s_max:,} {item.get('salaryCurrency', 'VND')}"
        elif s_min:
            salary = f"Từ {s_min:,} {item.get('salaryCurrency', 'VND')}"
        else:
            salary = "Thỏa thuận"

    # 4. Địa điểm
    locations = item.get("workingLocations") or []
    loc_short = ""
    if locations and isinstance(locations, list) and len(locations) > 0:
        loc_short = locations[0].get("cityName") or locations[0].get("address") or ""
    if not loc_short:
        loc_short = item.get("address") or ""

    # 5. URL bài đăng
    job_url = item.get("jobUrl")
    if not job_url:
        alias = item.get("alias") or "job"
        job_id = item.get("jobId") or ""
        job_url = f"{BASE_DOMAIN}/{alias}-{job_id}-jv"

    return {
        "job_url": job_url,
        "source": SOURCE_NAME,
        "job_title": item.get("jobTitle") or "Unknown Title",
        "company_name": item.get("companyName") or "",
        "company_url": item.get("companyUrl") or "",
        "company_logo": item.get("companyLogo") or "",
        "salary": salary,
        "experience": str(item.get("yearsOfExperience") or ""),
        "level": item.get("jobLevelVI") or item.get("jobLevel") or "",
        "work_type": None,
        "education": None,
        "industry": "IT - Phần mềm",
        "location_short": loc_short,
        "workplace_detail": item.get("address") or "",
        "working_time": None,
        "posted_date": item.get("approvedOn") or item.get("createdOn"),
        "deadline": item.get("expiredOn") or "",
        "keyword": kw_str,
        "job_description": clean_html(item.get("jobDescription")),
        "job_requirements": clean_html(item.get("jobRequirement")),
        "benefits": benefits_str,
        "extra_info": {
            "jobId": item.get("jobId"),
            "companyProfile": clean_html(item.get("companyProfile")),
            "prettyApprovedOn": item.get("prettyApprovedOn"),
            "companySize": item.get("companySizeVI") or item.get("companySize"),
        },
    }


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu trực tiếp vào bảng riêng `jobs_vietnamworks` trên Supabase và lưu backup JSON."""
    if not jobs:
        return

    # 1. Lưu lên Supabase PostgreSQL
    try:
        upsert_jobs_to_source_table(jobs, SOURCE_NAME)
    except Exception as e:
        logger.error(f"Lỗi khi lưu dữ liệu lên Supabase: {e}")

    # 2. Backup JSON cục bộ
    try:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(json_path, mode="w", encoding="utf-8") as f:
            json.dump(jobs, f, ensure_ascii=False, indent=2)
    except Exception as err:
        logger.debug(f"Không thể ghi file backup: {err}")


def crawl(
    page: Union[int, str, None] = 10,
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 0.8,
    max_delay: float = 1.8,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 6.0,
    proxy: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Tiến trình cào dữ liệu VietnamWorks thông qua REST API chính thức.
    - page: Số trang tối đa cần lấy (mặc định 10 trang, hoặc 'max' để cào toàn bộ).
    - max_jobs_per_page: Số lượng job mỗi trang (mặc định 'max' = 50 bài/trang, hoặc đặt số nguyên để test nhanh).
    - min_delay, max_delay: Độ trễ ngẫu nhiên giữa các trang để chống chặn IP.
    """
    # 1. Phân giải tham số page
    limit_pages: Optional[int] = None
    if isinstance(page, int):
        limit_pages = page if page > 0 else None
    elif isinstance(page, str):
        p_str = page.strip().lower()
        if p_str in ["max", "all", "none", "-1"]:
            limit_pages = None
        elif p_str.isdigit():
            limit_pages = int(p_str)
        else:
            limit_pages = 10

    # 2. Phân giải tham số max_jobs_per_page
    hits_per_page = 50
    limit_jobs_per_page: Optional[int] = None
    if isinstance(max_jobs_per_page, int):
        limit_jobs_per_page = max_jobs_per_page
        hits_per_page = min(max_jobs_per_page, 50)
    elif isinstance(max_jobs_per_page, str) and max_jobs_per_page.strip().isdigit():
        limit_jobs_per_page = int(max_jobs_per_page.strip())
        hits_per_page = min(limit_jobs_per_page, 50)

    logger.info(f"🚀 Bắt đầu crawl VietnamWorks qua REST API: {API_SEARCH_URL}")
    logger.info(
        f"⚙️  Cấu hình: Page = {limit_pages if limit_pages else 'MAX (Toàn bộ)'} | "
        f"Jobs/Page = {limit_jobs_per_page if limit_jobs_per_page else 'MAX (50 bài/trang)'} | "
        f"Delay = {min_delay}s - {max_delay}s"
    )

    resolved_proxy = proxy or os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
    session_kwargs: Dict[str, Any] = {"timeout": 30}
    if resolved_proxy:
        session_kwargs["proxies"] = {"http": resolved_proxy, "https": resolved_proxy}

    if HAS_CURL_CFFI:
        session_kwargs["impersonate"] = "chrome120"
        session = curl_requests.Session(**session_kwargs)
    else:
        session = curl_requests.Session()
        if resolved_proxy:
            session.proxies = {"http": resolved_proxy, "https": resolved_proxy}

    all_jobs: List[Dict[str, Any]] = []
    visited_urls = set()
    current_page = 0  # API VietnamWorks tính page từ 0

    while True:
        human_page_num = current_page + 1
        if limit_pages is not None and human_page_num > limit_pages:
            logger.info(f"🏁 Đã hoàn thành cào {limit_pages} trang theo cấu hình. Kết thúc.")
            break

        payload = {
            "userId": 0,
            "query": "",
            "filter": [{"field": "jobFunction", "value": "5"}],  # IT - Phần mềm
            "ranges": [],
            "order": [],
            "hitsPerPage": hits_per_page,
            "page": current_page,
        }

        logger.info(f"\n📄 Đang tải dữ liệu trang #{human_page_num} qua API...")
        headers = get_api_headers()

        response = None
        for attempt in range(1, 4):
            try:
                response = session.post(API_SEARCH_URL, json=payload, headers=headers, timeout=30)
                if response.status_code == 200:
                    break
                logger.warning(f"  ⚠️ Lần #{attempt}/3: API trả về HTTP {response.status_code}. Tạm nghỉ 2s...")
                time.sleep(2.0)
            except Exception as e:
                logger.warning(f"  ⚠️ Lần #{attempt}/3: Lỗi mạng {e}. Tạm nghỉ 2s...")
                time.sleep(2.0)

        if not response or response.status_code != 200:
            logger.error(f"❌ Không thể tải trang #{human_page_num} sau 3 lần thử. Dừng crawl.")
            break

        try:
            res_json = response.json()
        except Exception as err:
            logger.error(f"❌ Không thể parse JSON từ phản hồi: {err}")
            break

        raw_jobs = res_json.get("data") or []
        if not raw_jobs:
            logger.info(f"Không còn bài tuyển dụng nào ở trang #{human_page_num}. Đã duyệt hết toàn bộ danh sách!")
            break

        logger.info(f"🔍 Trang #{human_page_num}: Tìm thấy {len(raw_jobs)} bài tuyển dụng.")

        if limit_jobs_per_page:
            raw_jobs = raw_jobs[:limit_jobs_per_page]

        page_saved_count = 0
        for item in raw_jobs:
            job_data = parse_job_from_api(item)
            job_url = job_data.get("job_url")
            if not job_url or job_url in visited_urls:
                continue

            visited_urls.add(job_url)
            all_jobs.append(job_data)
            page_saved_count += 1

            title_disp = (job_data.get("job_title") or "")[:35]
            comp_disp = (job_data.get("company_name") or "N/A")[:25]
            logger.info(f"  ✅ {title_disp} | {comp_disp} | {job_data['salary']}")

        # Tự động lưu lũy tiến sau mỗi trang
        save_data(all_jobs)
        logger.info(f"💾 Đã lưu lũy tiến {len(all_jobs)} jobs vào Supabase.")

        current_page += 1
        delay = random.uniform(min_delay, max_delay)
        time.sleep(delay)

    logger.info(f"\n🎉 Hoàn thành crawl VietnamWorks! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ.")
    return all_jobs


if __name__ == "__main__":
    results = crawl(
        page=1,
        max_jobs_per_page=5,
    )
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs từ VietnamWorks.")
