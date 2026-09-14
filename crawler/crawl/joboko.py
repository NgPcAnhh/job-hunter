"""
Crawler for JobOKO (https://vn.joboko.com)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa theo cấu trúc DOM thực tế của JobOKO.

Cơ chế chống chặn IP & Anti-Bot tối ưu (Anti-Ban / Anti-Tarpit):
1. Giả lập TLS Fingerprint người thật: Sử dụng curl_cffi Session impersonate "chrome120" với đầy đủ Cookie jar.
2. Rotating User-Agents & Modern Sec-Ch-Ua Headers: Luân phiên User-Agent và Referer tự nhiên theo luồng duyệt.
3. Randomized Polite Delay & Jitter: Nghỉ ngẫu nhiên 1.2s - 2.5s giữa các lượt tải trang / bài đăng.
4. Batch Cooldown (Mô phỏng người dùng): Tự động nghỉ xả hơi (5s - 8s) sau mỗi 10 bài đăng để làm mới rate-limit window.
5. Phát hiện Captcha & Bot Challenge: Tự động phát hiện Recaptcha, hCaptcha, Cloudflare Turnstile, "Just a moment...".
6. Exponential Backoff & Retry: Tự động hạ nhiệt, tăng gấp đôi thời gian chờ khi gặp mã 403, 429, 503 hoặc Timeout.
7. Xử lý HTTP 404/410: Tự động phát hiện và bỏ qua nhanh bài đăng đã hết hạn/bị xóa mà không tốn thời gian retry.
8. Incremental Auto-Save: Lưu liên tục dữ liệu ra file CSV (UTF-8-sig) và JSON sau mỗi trang, không lo mất dữ liệu.
9. Hỗ trợ tham số page="max" (cào đến hết) hoặc page=N (cào đến trang N).
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
from typing import List, Dict, Any, Optional, Union, Tuple
from urllib.parse import urljoin

# Cấu hình encoding UTF-8 stdout trên Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Sử dụng curl_cffi để bypass TLS fingerprinting / bot protection; fallback sang requests nếu chưa cài
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
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

SOURCE_NAME = "joboko"
BASE_DOMAIN = "https://vn.joboko.com"
START_URL = "https://vn.joboko.com/viec-lam-nganh-it-phan-mem-cong-nghe-thong-tin-iot-dien-tu-vien-thong-xni124"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "joboko.csv"
OUTPUT_JSON = OUTPUT_DIR / "joboko.json"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]


class JobUrlList(list):
    """Danh sách các job_url có kèm thuộc tính next_page_url để thuận tiện quản lý phân trang."""
    def __init__(self, iterable=None, next_page_url: Optional[str] = None):
        super().__init__(iterable or [])
        self.next_page_url: Optional[str] = next_page_url


def get_random_headers(referer: Optional[str] = None) -> Dict[str, str]:
    """Tạo bộ HTTP headers hoàn chỉnh mô phỏng trình duyệt Chrome người thật."""
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin" if referer else "none",
        "Sec-Fetch-User": "?1",
        "Sec-Ch-Ua": '"Not?A_Brand";v="99", "Chromium";v="128", "Google Chrome";v="128"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
    }
    if referer:
        headers["Referer"] = referer
    return headers


def safe_text(elem: Any, sep: str = " ") -> str:
    """Trích xuất chuỗi văn bản an toàn, loại bỏ khoảng trắng thừa."""
    if elem is None:
        return ""
    if hasattr(elem, "get_text"):
        return elem.get_text(separator=sep, strip=True)
    return str(elem).strip()


def check_is_captcha_or_challenge(response: Any) -> bool:
    """Kiểm tra xem phản hồi có phải là trang thử thách Bot / Captcha không."""
    if not response or not hasattr(response, "text"):
        return False

    if response.status_code in [403, 429]:
        return True

    text_sample = response.text.lower()[:3000]
    indicators = [
        "g-recaptcha",
        "recaptcha/api",
        "h-captcha",
        "hcaptcha",
        "cf-turnstile",
        "cf-challenge",
        "just a moment...",
        "ddos-guard",
        "challenge-platform",
        "attention required! | cloudflare",
        "<title>bot verification</title>",
        "vui lòng xác minh",
    ]
    return any(ind in text_sample for ind in indicators)


def safe_request(
    session: Optional[Any],
    url: str,
    max_retries: int = 4,
    initial_backoff: float = 4.0,
    referer: Optional[str] = None
) -> Optional[Any]:
    """
    Gửi HTTP request an toàn tích hợp đầy đủ cơ chế chống chặn IP:
    - Luân phiên User-Agent và Referer tự nhiên.
    - Phát hiện sớm mã 403, 429, 503 hoặc trang Captcha / Bot Challenge.
    - Kích hoạt Exponential Backoff (tăng gấp đôi thời gian nghỉ để máy chủ gỡ cờ IP).
    - Nhận diện bài đăng đã đóng (HTTP 404, 410) để bỏ qua ngay, không retry vô ích.
    """
    backoff = initial_backoff

    for attempt in range(1, max_retries + 1):
        headers = get_random_headers(referer=referer)
        try:
            if session:
                response = session.get(url, headers=headers, timeout=30)
            elif HAS_CURL_CFFI:
                response = curl_requests.get(url, headers=headers, impersonate="chrome120", timeout=30)
            else:
                response = curl_requests.get(url, headers=headers, timeout=30)

            # Nếu bài đăng đã hết hạn hoặc bị xóa (404 Not Found hoặc 410 Gone) -> Bỏ qua ngay
            if response.status_code in [404, 410]:
                logger.info(f"Tin tuyển dụng đã đóng hoặc không tồn tại (HTTP {response.status_code}): {url}")
                return response

            # Kiểm tra Bot Challenge / Captcha
            if check_is_captcha_or_challenge(response):
                logger.warning(
                    f"⚠️  [Anti-Ban] Phát hiện Bot Challenge/Captcha tại lần thử #{attempt}/{max_retries}. "
                    f"Tự động tạm dừng {backoff:.1f}s để giải phóng cờ IP..."
                )
                time.sleep(backoff)
                backoff *= 2
                continue

            if response.status_code == 200:
                return response

            if response.status_code in [429, 503]:
                logger.warning(
                    f"⚠️  [Rate-limit HTTP {response.status_code}] Máy chủ yêu cầu giảm tốc. "
                    f"Tạm dừng hạ nhiệt {backoff:.1f}s..."
                )
                time.sleep(backoff)
                backoff *= 2
                continue

            if response.status_code == 403:
                logger.warning(
                    f"⚠️  [Forbidden HTTP 403] Tường lửa nghi ngờ bot. "
                    f"Tạm dừng {backoff:.1f}s trước khi thử lại..."
                )
                time.sleep(backoff)
                backoff *= 2
                continue

            logger.warning(f"Request {url} trả về HTTP {response.status_code}")
            return response

        except Exception as e:
            logger.warning(
                f"⚠️  [Sự cố mạng / Timeout] Lần #{attempt}/{max_retries}: {type(e).__name__} - {e}. "
                f"Đang chờ {backoff:.1f}s..."
            )
            time.sleep(backoff)
            backoff *= 2

    logger.error(f"❌ Không thể tải {url} sau {max_retries} lần thử.")
    return None


def extract_job_urls(page_html: str, base_url: str = BASE_DOMAIN) -> JobUrlList:
    """
    Trích xuất danh sách liên kết việc làm và URL trang kế tiếp từ HTML danh sách (Ảnh 1):
    - Tìm container 'div.nw-job-list__list'.
    - Lấy toàn bộ thẻ 'h2.item-title a' (hoặc '.item-title a'), rút trích href và chuẩn hóa tuyệt đối.
    - Tìm thẻ xem thêm 'div.nw-job-list__more a', trích xuất link tiếp theo nếu có (dạng /jobs?ind=124&pr=1 hoặc ?p=2).
    """
    soup = BeautifulSoup(page_html, "html.parser")
    job_urls: List[str] = []
    seen = set()

    # Tìm các thẻ link bài viết trong danh sách
    job_links = soup.select(
        "div.nw-job-list__list h2.item-title a, "
        "div.nw-job-list__list .item-title a, "
        "h2.item-title a, .item-title a"
    )

    for a_elem in job_links:
        raw_href = a_elem.get("href")
        if not raw_href:
            continue
        clean_href = raw_href.strip()
        full_url = urljoin(base_url, clean_href)
        if full_url not in seen:
            seen.add(full_url)
            job_urls.append(full_url)

    # Tìm liên kết xem thêm / trang tiếp theo (Load More)
    next_page_url: Optional[str] = None
    more_btn = soup.select_one("div.nw-job-list__more a, .nw-job-list__more a")
    if more_btn and more_btn.get("href"):
        raw_more = more_btn.get("href").strip()
        next_page_url = urljoin(base_url, raw_more)

    return JobUrlList(job_urls, next_page_url=next_page_url)


def get_job_cards_metadata(page_html: str, base_url: str = BASE_DOMAIN) -> Dict[str, Dict[str, str]]:
    """
    Trích xuất metadata bổ trợ từ các card ở trang danh sách (Ảnh 1):
    - job_url: Link chi tiết
    - job_title_list: Text của thẻ <a> trong h2.item-title
    """
    soup = BeautifulSoup(page_html, "html.parser")
    metadata_map: Dict[str, Dict[str, str]] = {}

    job_links = soup.select("h2.item-title a, .item-title a")
    for a_elem in job_links:
        raw_href = a_elem.get("href")
        if not raw_href:
            continue
        full_url = urljoin(base_url, raw_href.strip())
        title_text = safe_text(a_elem)
        metadata_map[full_url] = {
            "job_title_list": title_text,
        }

    return metadata_map


def extract_container_text(elem: Any) -> str:
    """Helper gom toàn bộ text sạch trong container danh sách (ul/ol/li) hoặc đoạn văn (p)."""
    if not elem:
        return ""
    lis = elem.select("ul li, ol li, li")
    if lis:
        items = [safe_text(li) for li in lis if safe_text(li)]
        return "\n".join(items)
    return safe_text(elem, sep="\n")


def parse_job_detail(detail_html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách an toàn thông tin chi tiết bài đăng từ DOM vn.joboko.com:
    - Header & Thông tin cơ bản (Ảnh 2):
        + job_title: Text của h1.int-job-detail-title
        + location_short: Text trong thẻ con của div/dl.int-job-detail-location
        + salary: Text trong dd của div/dl.int-job-detail-salary (hoặc title)
        + experience: Text trong thẻ dd của khối dl kinh nghiệm kế bên
        + deadline: Text trong div.int-job-detail-deadline b (chuỗi DD/MM/YYYY)
    - Nội dung chi tiết & Nơi làm việc (Ảnh 3 & 4 - trong div.int-job-detail-wysiwyg):
        + job_description: Gom text thẻ li trong div.text-left.job-desc
        + job_requirements: Gom text thẻ li trong div.text-left.job-requirement
        + job_benefits / benefits: Gom text thẻ li trong div.text-left.job-benefit
        + general_info: Gom text các thẻ li trong div.text-left.job-base-infos
        + workplace: Gom text các thẻ li trong div.text-left.job-work-places
    """
    soup = BeautifulSoup(detail_html, "html.parser")

    # 1. Tên công việc (Ảnh 2: h1.int-job-detail-title)
    h1_elem = soup.select_one("h1.int-job-detail-title, h1")
    job_title = safe_text(h1_elem)

    # 2. Địa điểm sơ bộ (Ảnh 2: div/dl.int-job-detail-location)
    loc_elem = soup.select_one("dl.int-job-detail-location dd, .int-job-detail-location dd, .int-job-detail-location")
    location_short = safe_text(loc_elem)

    # 3. Mức lương (Ảnh 2: div/dl.int-job-detail-salary)
    sal_elem = soup.select_one("dl.int-job-detail-salary, .int-job-detail-salary")
    salary = ""
    if sal_elem:
        salary = sal_elem.get("title") or safe_text(sal_elem.select_one("dd") if sal_elem.select_one("dd") else sal_elem)

    # 4. Kinh nghiệm (Ảnh 2: dl chứa icon kinh nghiệm hoặc dl thứ 3 trong entry)
    experience = ""
    for dl in soup.select("div.int-job-detail-entry dl, .int-job-detail-entry dl"):
        img = dl.select_one("img")
        if img and "kinh-nghiem" in img.get("src", ""):
            experience = safe_text(dl.select_one("dd"))
            break
        elif not dl.get("class") and dl.select_one("dd"):
            experience = safe_text(dl.select_one("dd"))

    # 5. Hạn nộp hồ sơ (Ảnh 2: div.int-job-detail-deadline b)
    deadline_b = soup.select_one("div.int-job-detail-deadline b, .int-job-detail-deadline b")
    deadline = safe_text(deadline_b)
    if not deadline:
        # Fallback tìm trong toàn bộ text deadline
        dl_block = soup.select_one("div.int-job-detail-deadline, .int-job-detail-deadline")
        if dl_block:
            dl_text = safe_text(dl_block)
            match = re.search(r"\d{2}/\d{2}/\d{4}", dl_text)
            deadline = match.group(0) if match else dl_text

    # 6. Tên công ty & Logo (Cột thông tin nhà tuyển dụng bên phải - Ảnh 3 DevTools)
    company_name = ""
    company_logo = ""
    comp_elem = soup.select_one(
        "h2.int-business-info-box-title, "
        ".int-business-info-box-title, "
        "div.int-business-info-box h2"
    )
    if comp_elem:
        company_name = safe_text(comp_elem)

    logo_img = soup.select_one(
        "div.int-business-info-box-image-inner img, "
        "div.int-business-info-box-image img, "
        "div.int-business-info-box img, "
        ".int-business-info-box-image img, "
        "img[src*='joboko.com/company/']"
    )
    if logo_img:
        raw_src = logo_img.get("src") or logo_img.get("data-src") or ""
        if raw_src:
            company_logo = urljoin(BASE_DOMAIN, raw_src.strip())
        if not company_name and logo_img.get("alt"):
            company_name = logo_img.get("alt").strip()

    # 7. Nội dung chi tiết trong div.int-job-detail-wysiwyg (Ảnh 3 & 4)
    desc_elem = soup.select_one("div.text-left.job-desc, .job-desc")
    job_description = extract_container_text(desc_elem)

    req_elem = soup.select_one("div.text-left.job-requirement, .job-requirement")
    job_requirements = extract_container_text(req_elem)

    ben_elem = soup.select_one("div.text-left.job-benefit, .job-benefit")
    benefits = extract_container_text(ben_elem)

    gen_elem = soup.select_one("div.text-left.job-base-infos, .job-base-infos")
    general_info = extract_container_text(gen_elem)

    work_elem = soup.select_one("div.text-left.job-work-places, .job-work-places")
    workplace = extract_container_text(work_elem)

    return {
        "job_url": job_url,
        "source": SOURCE_NAME,
        "job_title": job_title,
        "company_name": company_name,
        "company_url": None,
        "company_logo": company_logo,
        "salary": salary,
        "experience": experience,
        "level": None,
        "work_type": None,
        "education": None,
        "industry": None,
        "location_short": location_short,
        "workplace_detail": workplace,
        "working_time": None,
        "posted_date": None,
        "deadline": deadline,
        "keyword": None,
        "job_description": job_description,
        "job_requirements": job_requirements,
        "benefits": benefits,
        "extra_info": {
            "general_info": general_info,
        },
    }


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu trực tiếp vào bảng riêng `jobs_joboko` trên Supabase và lưu backup JSON."""
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


def create_session(proxy: Optional[str] = None) -> Any:
    """
    Tạo Client Session lưu trữ Cookies liên tục giữa các lượt request,
    kết hợp giả lập TLS Fingerprint của Chrome thật để tránh bị hệ thống anti-bot phát hiện.
    """
    resolved_proxy = proxy or os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")

    if HAS_CURL_CFFI:
        session_kwargs: Dict[str, Any] = {
            "impersonate": "chrome120",
            "timeout": 30,
        }
        if resolved_proxy:
            session_kwargs["proxies"] = {"http": resolved_proxy, "https": resolved_proxy}
        return curl_requests.Session(**session_kwargs)
    else:
        session = curl_requests.Session()
        if resolved_proxy:
            session.proxies = {"http": resolved_proxy, "https": resolved_proxy}
        return session


def crawl(
    max_clicks: Union[int, str, None] = "max",
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 1.2,
    max_delay: float = 2.5,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 6.0,
    proxy: Optional[str] = None,
    page: Optional[Union[int, str]] = None,
    load_more_times: Optional[Union[int, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Tiến trình cào dữ liệu JobOKO dựa trên số lần ấn nút 'Xem thêm việc làm' (div.nw-job-list__more a):
    - Tham số max_clicks:
        + Nếu đặt "max" (hoặc None, "all"): ấn nút 'Xem thêm việc làm' liên tục cho tới khi không còn nút đó nữa.
        + Nếu đặt số (ví dụ: max_clicks=10): chỉ ấn nút 'Xem thêm việc làm' tối đa 10 lần rồi dừng.
    - Cơ chế xem thêm: Lần lượt điều hướng theo link Xem thêm trong div.nw-job-list__more a (dạng /jobs?ind=124&pr=1 hoặc ?p=2).
    - Session lưu Cookies tự nhiên như người dùng mở trình duyệt thật (TLS Chrome 120).
    - Duyệt từng bài viết kèm Randomized Polite Delay (mặc định 1.2s - 2.5s).
    - Batch Cooldown: Sau mỗi 10 bài viết, tạm dừng 6.0s để làm mới rate-limit window.
    - Tự động lưu lũy tiến dữ liệu ra file CSV và JSON sau mỗi đợt nạp hoàn tất.
    """
    # Phân giải tham số max_clicks (chấp nhận load_more_times hoặc page làm alias tương thích)
    raw_limit = load_more_times if load_more_times is not None else (page if page is not None else max_clicks)
    limit_clicks: Optional[int] = None

    if isinstance(raw_limit, str):
        raw_str = raw_limit.strip().lower()
        if raw_str in ["max", "all", "none", "full", "-1"]:
            limit_clicks = None
        elif raw_str.isdigit():
            limit_clicks = int(raw_str)
        else:
            logger.warning(f"Tham số max_clicks='{raw_limit}' không hợp lệ. Mặc định là 'max' (ấn đến khi hết nút).")
            limit_clicks = None
    elif isinstance(raw_limit, (int, float)):
        limit_clicks = int(raw_limit) if raw_limit >= 0 else None
    else:
        limit_clicks = None

    logger.info(f"🚀 Bắt đầu crawl JobOKO: {START_URL}")
    if limit_clicks is not None:
        logger.info(f"🎯 Giới hạn ấn nút: Tối đa {limit_clicks} lần ấn nút 'Xem thêm việc làm' (div.nw-job-list__more a).")
    else:
        logger.info("🎯 Chế độ ấn nút: 'max' (Ấn nút 'Xem thêm việc làm' liên tục cho tới khi KHÔNG CÒN nút nữa).")

    logger.info(
        f"🛡️  [Anti-Ban Kích Hoạt] TLS Chrome120 | Delay {min_delay}s - {max_delay}s | "
        f"Cooldown {batch_cooldown_seconds}s mỗi {batch_cooldown_every} jobs."
    )

    session = create_session(proxy=proxy)
    all_jobs: List[Dict[str, Any]] = []
    visited_urls = set()
    job_counter = 0
    clicks_count = 0
    batch_index = 1
    current_url: Optional[str] = START_URL
    last_referer: Optional[str] = None

    # Phân giải tham số max_jobs_per_page
    limit_jobs_per_page: Optional[int] = None
    if isinstance(max_jobs_per_page, int):
        limit_jobs_per_page = max_jobs_per_page
    elif isinstance(max_jobs_per_page, str) and max_jobs_per_page.strip().isdigit():
        limit_jobs_per_page = int(max_jobs_per_page.strip())
    else:
        limit_jobs_per_page = None

    while current_url:
        logger.info(f"\n📄 [Đợt #{batch_index}] Đang tải danh sách: {current_url}")
        res = safe_request(session, current_url, max_retries=3, referer=last_referer)
        if not res or res.status_code != 200:
            logger.warning(f"Không thể tải đợt #{batch_index} (Status: {res.status_code if res else 'None'}). Dừng crawl.")
            break

        last_referer = current_url

        # Trích xuất danh sách link bài viết và link xem thêm tiếp theo (từ div.nw-job-list__more a)
        url_list_obj = extract_job_urls(res.text, base_url=BASE_DOMAIN)
        job_urls = list(url_list_obj)
        next_more_url = url_list_obj.next_page_url

        if not job_urls:
            logger.info(f"Không tìm thấy việc làm nào ở đợt #{batch_index}. Kết thúc crawl!")
            break

        logger.info(f"Tìm thấy {len(job_urls)} bài tuyển dụng tại đợt #{batch_index}.")
        cards_metadata = get_job_cards_metadata(res.text, base_url=BASE_DOMAIN)

        if limit_jobs_per_page:
            job_urls = job_urls[:limit_jobs_per_page]

        for idx, job_url in enumerate(job_urls, start=1):
            if job_url in visited_urls:
                continue
            visited_urls.add(job_url)
            job_counter += 1

            # Nghỉ xả hơi theo batch (Batch Cooldown) mô phỏng người dùng thật nghỉ tay
            if job_counter > 1 and (job_counter % batch_cooldown_every == 0):
                cooldown_jitter = batch_cooldown_seconds + random.uniform(1.0, 2.5)
                logger.info(f"☕ [Batch Cooldown] Đã cào {job_counter} jobs. Tạm dừng {cooldown_jitter:.1f}s để giải tỏa tải server...")
                time.sleep(cooldown_jitter)
            else:
                # Delay ngẫu nhiên giữa các request (Randomized Polite Delay)
                delay = random.uniform(min_delay, max_delay)
                time.sleep(delay)

            logger.info(f"  [{idx}/{len(job_urls)}] Cào chi tiết: {job_url}")
            detail_res = safe_request(session, job_url, referer=current_url)

            if not detail_res or detail_res.status_code != 200:
                logger.warning(f"  ❌ Bỏ qua job do không tải được: {job_url}")
                continue

            try:
                job_data = parse_job_detail(detail_res.text, job_url)

                # Gắn thêm trường trích xuất từ card danh sách (Ảnh 1)
                meta = cards_metadata.get(job_url, {})
                job_data["job_title_list"] = meta.get("job_title_list", "")
                if not job_data["job_title"] and job_data["job_title_list"]:
                    job_data["job_title"] = job_data["job_title_list"]

                all_jobs.append(job_data)
                title_disp = (job_data.get("job_title") or "")[:35]
                comp_disp = (job_data.get("company_name") or "N/A")[:25]
                logger.info(
                    f"  ✅ [Thành công] {title_disp} | Công ty: {comp_disp} | "
                    f"Lương: {job_data['salary']} | Địa điểm: {job_data['location_short']}"
                )
            except Exception as e:
                logger.error(f"  ❌ Lỗi khi bóc tách {job_url}: {e}")

        # Tự động lưu lũy tiến dữ liệu sau mỗi đợt nạp hoàn tất
        save_data(all_jobs)

        # Kiểm tra điều kiện có còn nút Xem thêm không (div.nw-job-list__more a)
        if not next_more_url:
            logger.info("Không còn nút 'Xem thêm việc làm' (div.nw-job-list__more a) nào nữa. Đã duyệt hết toàn bộ dữ liệu!")
            break

        # Kiểm tra giới hạn số lần ấn nút nếu được chỉ định
        if limit_clicks is not None and clicks_count >= limit_clicks:
            logger.info(f"Đã đạt giới hạn tối đa {limit_clicks} lần ấn nút 'Xem thêm việc làm'. Dừng crawl.")
            break

        # Thực hiện ấn nút Xem thêm
        clicks_count += 1
        batch_index += 1
        logger.info(
            f"👉 [Ấn nút Xem Thêm #{clicks_count}"
            f"{f'/{limit_clicks}' if limit_clicks is not None else ''}] "
            f"Chuyển tiếp qua liên kết của nút: {next_more_url}"
        )
        current_url = next_more_url

    logger.info(f"\n🎉 Hoàn thành crawl JobOKO! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ qua {clicks_count} lần ấn nút xem thêm.")
    return all_jobs


if __name__ == "__main__":
    # TÙY CHỌN CẤU HÌNH KHI CHẠY:
    # - max_clicks: Số lần ấn nút "Xem thêm việc làm" (div.nw-job-list__more a):
    #     + Nếu đặt "max": ấn nút liên tục cho tới khi KHÔNG CÒN nút xem thêm nữa thì thôi.
    #     + Nếu đặt số (ví dụ: max_clicks=10): chỉ ấn nút Xem Thêm tối đa 10 lần.
    # - max_jobs_per_page: Số job tối đa mỗi đợt nạp (None = cào TOÀN BỘ jobs tìm thấy)
    # - min_delay, max_delay: Thời gian nghỉ ngẫu nhiên giữa các job (chống chặn IP)
    
    results = crawl(
        max_clicks=10,         # Đặt "max" để ấn đến khi hết nút, hoặc đặt số (ví dụ: max_clicks=10 để ấn 10 lần)
        max_jobs_per_page=None,   # None = cào toàn bộ job sau mỗi lần ấn
        min_delay=1.2,
        max_delay=2.5,
    )
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs.")

