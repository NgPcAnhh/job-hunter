"""
Crawler for CareerLink (https://www.careerlink.vn)
Tích hợp sẵn các cơ chế chống chặn IP (Anti-Bot / Anti-IP Ban):
1. Rotating User-Agents (Luân phiên danh tính trình duyệt).
2. Randomized Polite Delay (Độ trễ ngẫu nhiên mô phỏng người thật).
3. Exponential Backoff & Retry (Tự động hạ nhiệt và thử lại khi gặp Timeout hoặc Captcha).
4. Auto-save incremental (Lưu liên tục cả CSV chuẩn UTF-8-sig và JSON vào Bronze).
5. Trích xuất chuyên sâu danh mục Ngành nghề / Keyword:
   Lưu dưới định dạng '{keyword_1} {keyword_2} ...' trong cột 'keyword', loại bỏ hoàn toàn dấu phẩy ','.
6. Hỗ trợ tham số linh hoạt:
   - page: Mặc định là 10 (chỉ lấy 10 page), hoặc đặt 'max' để cào toàn bộ các trang.
   - max_jobs_per_page: Mặc định là 'max' (lấy toàn bộ bài đăng trên trang) hoặc đặt số N để test nhanh.
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

# Cấu hình encoding UTF-8 stdout trên Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

SOURCE_NAME = "careerlink"
# Mặc định lọc tin đăng trong vòng 3 ngày hoặc tùy chỉnh
DEFAULT_POSTED_WITHIN = 7
BASE_LIST_URL = f"https://www.careerlink.vn/viec-lam/cntt-phan-mem/19?posted_within={DEFAULT_POSTED_WITHIN}"
BASE_URL = f"{BASE_LIST_URL}&page=1"

# Đường dẫn lưu trữ thư mục Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "careerlink.csv"
OUTPUT_JSON = OUTPUT_DIR / "careerlink.json"

# Danh sách User-Agents thực tế để luân phiên (tránh bị phát hiện một profile cố định)
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:129.0) Gecko/20100101 Firefox/129.0",
]


def get_request_headers(referer: Optional[str] = None) -> Dict[str, str]:
    """Tạo bộ header HTTP tự nhiên tương thích hoàn hảo với fingerprint của TLS client."""
    if HAS_CURL_CFFI:
        # curl_cffi Chrome120 tự sinh User-Agent, Sec-Ch-Ua, Sec-Fetch nhất quán. Chỉ cần bổ sung ngôn ngữ & referer
        headers = {
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        }
    else:
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        }
    if referer:
        headers["Referer"] = referer
    return headers


# Alias tương thích
get_random_headers = get_request_headers


def fetch_list_page_with_playwright(url: str, session: Optional[Any] = None) -> Optional[str]:
    """Fallback bằng Stealth Browser (Subprocess độc lập) để an toàn 100% trong ThreadPoolExecutor đa luồng."""
    try:
        from crawler.utils.browser_solver import fetch_with_stealth_browser, sync_cookies_to_session
        logger.info(f"🌐 [Subprocess Browser] Đang tải trang bằng trình duyệt: {url}")
        res = fetch_with_stealth_browser(url, timeout_sec=35)
        if res and res.status_code == 200 and len(res.text) > 1000:
            if session is not None and res.cookies:
                sync_cookies_to_session(session, res.cookies)
            return res.text
        return None
    except Exception as e:
        logger.warning(f"⚠️ Browser Fallback gặp lỗi: {e}")
        return None


def check_is_captcha_or_challenge(response) -> bool:
    """Kiểm tra xem phản hồi có phải là trang thử thách Bot / Captcha không."""
    if response is None:
        return False
    if response.status_code in [403, 429]:
        return True
    if "/recaptcha" in str(getattr(response, "url", "")):
        return True
    lower_text = response.text.lower()
    challenge_indicators = [
        "cf-turnstile",
        "cf-challenge",
        "just a moment...",
        "recaptcha_confirm_form",
        "h-captcha",
        "challenge-platform",
        "attention required! | cloudflare",
        "access denied",
    ]
    return any(ind in lower_text for ind in challenge_indicators)


def safe_request(
    session: Any,
    url: str,
    max_retries: int = 4,
    initial_backoff: float = 4.0,
    referer: Optional[str] = None
) -> Optional[Any]:
    """
    Hàm gửi request an toàn bảo vệ chống chặn IP (Anti-Ban / Anti-Tarpit):
    - Sử dụng curl_cffi giả lập TLS Chrome 120.
    - Nhất quán Client Hints / User-Agent.
    - Phát hiện Captcha/Challenge. Khi phát hiện, tự động 'ngủ hạ nhiệt' (Backoff) và thử lại.
    - Xử lý timeout/drop connection tự động bằng Exponential Backoff.
    """
    backoff = initial_backoff

    for attempt in range(1, max_retries + 1):
        headers = get_request_headers(referer=referer)

        try:
            if HAS_CURL_CFFI:
                response = session.get(url, headers=headers, timeout=30, impersonate="chrome120")
            else:
                response = session.get(url, headers=headers, timeout=30)

            # Kiểm tra xem website có trả về trang kiểm tra Bot / Captcha không
            if check_is_captcha_or_challenge(response):
                logger.warning(
                    f"⚠️  [Anti-Ban] Website yêu cầu xác thực Bot/Challenge tại lần thử #{attempt}/{max_retries}. "
                    f"Tự động tạm dừng {backoff:.1f}s để giải phóng cờ IP..."
                )
                time.sleep(backoff)
                backoff *= 2
                continue

            if response.status_code == 200:
                return response

            if response.status_code in [429, 503]:
                logger.warning(
                    f"⚠️  [Rate-Limit HTTP {response.status_code}] Tạm dừng {backoff:.1f}s trước khi thử lại..."
                )
                time.sleep(backoff)
                backoff *= 2
                continue

            if response.status_code == 403:
                logger.warning(
                    f"⚠️  [Forbidden HTTP 403] Tường lửa nghi ngờ bot. Tạm dừng {backoff:.1f}s trước khi thử lại..."
                )
                time.sleep(backoff)
                backoff *= 2
                continue

            logger.warning(f"Request {url} trả về HTTP {response.status_code}")
            return response

        except Exception as e:
            logger.warning(
                f"⚠️  [Kết nối bị giữ/Timeout] Lần #{attempt}/{max_retries}: {type(e).__name__} - {e}. "
                f"Đang chờ hạ nhiệt {backoff:.1f}s..."
            )
            time.sleep(backoff)
            backoff *= 2

    logger.error(f"❌ Không thể truy cập {url} sau {max_retries} lần thử.")
    return None


def extract_keywords(soup: BeautifulSoup) -> str:
    """
    Trích xuất danh sách ngành nghề / keyword từ khối tóm tắt công việc (Job Summary):
    - Tìm thẻ có class 'summary-label' chứa text 'Ngành nghề'
    - Lấy text từng thẻ <a> (hoặc <span> bên trong <a>)
    - Loại bỏ dấu phẩy ',' và khoảng trắng thừa
    - Định dạng đầu ra: '{keyword_1} {keyword_2} ...' trong 1 cột
    """
    keywords = []

    # Cách 1: Tìm theo .job-summary-item chứa .summary-label 'Ngành nghề'
    summary_items = soup.select(".job-summary-item, .d-flex.align-items-baseline.label, #job-summary")
    for item in summary_items:
        label_elem = item.select_one(".summary-label, .label")
        if label_elem and "ngành nghề" in label_elem.get_text().lower():
            for a in item.select(".font-weight-bolder a, a[href*='/viec-lam/']"):
                kw = a.get_text(strip=True).strip(",").strip()
                if kw and kw not in keywords:
                    keywords.append(kw)
            break

    # Cách 2: Fallback nếu cấu trúc DOM có chút thay đổi
    if not keywords:
        for div in soup.find_all(class_=lambda c: c and "summary-label" in c):
            if "ngành nghề" in div.get_text().lower():
                parent = div.find_parent(class_=lambda c: c and "job-summary-item" in c) or div.parent
                if parent:
                    for a in parent.find_all("a"):
                        kw = a.get_text(strip=True).strip(",").strip()
                        if kw and kw not in keywords:
                            keywords.append(kw)
                break

    if not keywords:
        return ""

    # Định dạng chuỗi theo mẫu: {a} {b} {c}
    return " ".join([f"{{{kw}}}" for kw in keywords])


def parse_job_detail(soup: BeautifulSoup, job_url: str = "") -> Dict[str, Any]:
    """
    Bóc tách toàn bộ thông tin chi tiết một bài đăng việc làm từ DOM CareerLink.
    Áp dụng cơ chế Safe Extraction để tránh lỗi NoneType.
    """
    # 1. Header Block - Loại bỏ thẻ h1 ẩn SEO (h1.d-none)
    job_title_elem = soup.select_one("h1.job-title:not(.d-none), h1#job-title:not(.d-none), h1:not(.d-none)")
    job_title = job_title_elem.get_text(strip=True) if job_title_elem else None

    # Fallback tiêu đề từ meta og:title nếu h1 không có
    if not job_title or "careerlink" in job_title.lower():
        og_elem = soup.find("meta", property="og:title")
        if og_elem and og_elem.get("content"):
            cand = og_elem["content"].split("-")[0].strip()
            if "careerlink" not in cand.lower() and "tuyển dụng" not in cand.lower() and len(cand) > 3:
                job_title = cand

    comp_a = soup.select_one("p.org-name a, a.org-name, div.org-name a")
    company_name = None
    company_url = None
    if comp_a:
        company_name = comp_a.get_text(strip=True) or comp_a.get("title")
        raw_comp_href = comp_a.get("href")
        company_url = urljoin("https://www.careerlink.vn", raw_comp_href) if raw_comp_href else None

    logo_img = soup.select_one("div.company-logo img, img.company-logo")
    company_logo = logo_img.get("src") if logo_img else None
    category = "Công nghệ thông tin"

    # Trích xuất keyword ngành nghề theo định dạng {a} {b} {c}
    keyword = extract_keywords(soup)

    # 2. Overview Block
    location_elem = soup.select_one("#job-location")
    location = " ".join(location_elem.stripped_strings) if location_elem else None

    salary_elem = soup.select_one("#job-salary .text-primary, #job-salary")
    salary = salary_elem.get_text(strip=True) if salary_elem else None

    # Experience: khối d-flex mb-2 nằm giữa salary và date
    experience = None
    overview_block = soup.select_one("div.job-overview")
    if overview_block:
        overview_divs = overview_block.find_all(
            "div",
            class_=lambda c: c and "d-flex" in c and "mb-2" in c,
            recursive=False
        )
        for div in overview_divs:
            div_id = div.get("id", "")
            if div_id not in ["job-location", "job-salary", "job-date"]:
                text_val = div.get_text(strip=True)
                if text_val:
                    experience = text_val
                    break

    # Posted Date
    date_elem = soup.select_one("#job-date .date-from")
    posted_date = None
    if date_elem:
        raw_date_text = date_elem.get_text(strip=True)
        match = re.search(r"\d{2}-\d{2}-\d{4}", raw_date_text)
        if match:
            posted_date = match.group(0)
        else:
            posted_date = raw_date_text.replace("Ngày đăng tuyển:", "").strip()

    # Expiry Info
    exp_elem = soup.select_one("#job-date .day-expired")
    expiry_info = " ".join(exp_elem.get_text().split()) if exp_elem else None

    # 3. Body Details
    desc_sec = soup.select_one("#section-job-description")
    job_description = None
    if desc_sec:
        desc_content = desc_sec.select_one(".rich-text-content") or desc_sec
        job_description = desc_content.get_text(separator="\n", strip=True)

    benefits_sec = soup.select_one("#section-job-benefits")
    benefits_list = []
    if benefits_sec:
        items = benefits_sec.select(".job-benefit-item")
        if items:
            benefits_list = [item.get_text(strip=True) for item in items if item.get_text(strip=True)]
        else:
            txt = benefits_sec.get_text(separator="\n", strip=True)
            if txt:
                benefits_list = [txt]
    benefits = " ; ".join(benefits_list) if benefits_list else None

    skills_sec = soup.select_one("#section-job-skills")
    skills_requirements = None
    if skills_sec:
        skills_content = skills_sec.select_one(".rich-text-content, .raw-content") or skills_sec
        skills_requirements = skills_content.get_text(separator="\n", strip=True)

    return {
        "job_url": job_url,
        "source": SOURCE_NAME,
        "job_title": job_title,
        "company_name": company_name,
        "company_url": company_url,
        "company_logo": company_logo,
        "salary": salary,
        "experience": experience,
        "level": None,
        "work_type": None,
        "education": None,
        "industry": category,
        "location_short": location,
        "workplace_detail": None,
        "working_time": None,
        "posted_date": posted_date,
        "deadline": expiry_info,
        "keyword": keyword,
        "job_description": job_description,
        "job_requirements": skills_requirements,
        "benefits": benefits,
        "extra_info": {},
    }


def extract_job_urls_from_page(soup: BeautifulSoup) -> List[str]:
    """Trích xuất toàn bộ URL chi tiết bài đăng từ trang danh sách."""
    job_urls: List[str] = []
    list_container = soup.select_one("div.list-group.mt-4, .list-group") or soup
    job_elements = list_container.select(".job-item")

    for job_elem in job_elements:
        job_url = None
        link_elem = job_elem.select_one("a.job-link, a[href*='/tim-viec-lam/']")
        if link_elem and link_elem.get("href"):
            raw_href = link_elem.get("href").strip()
            job_url = urljoin("https://www.careerlink.vn", raw_href)
        else:
            comp_link = job_elem.select_one("a.job-company, a.text-dark.job-company")
            if comp_link and comp_link.get("href"):
                raw_href = comp_link.get("href").strip()
                if "/tim-viec-lam/" in raw_href:
                    job_url = urljoin("https://www.careerlink.vn", raw_href)
                else:
                    job_url = urljoin("https://www.careerlink.vn/tim-viec-lam/", raw_href.lstrip("/"))

        if job_url and job_url not in job_urls:
            job_urls.append(job_url)

    # Fallback dự phòng: Quét trực tiếp các thẻ a chứa link bài tuyển dụng dạng /tim-viec-lam/.../<id>
    if not job_urls:
        for a in soup.select('a[href*="/tim-viec-lam/"]'):
            href = a.get("href", "").strip()
            # Link bài đăng chi tiết có cấu trúc /tim-viec-lam/<slug>/<id>
            if re.search(r"/\d+(\?.*)?$", href):
                full_url = urljoin("https://www.careerlink.vn", href)
                if full_url not in job_urls:
                    job_urls.append(full_url)

    return job_urls


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu trực tiếp vào bảng riêng `jobs_careerlink` trên Supabase và lưu backup JSON."""
    if not jobs:
        return

    # 1. Lưu trực tiếp vào bảng nguồn riêng trên Supabase PostgreSQL
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


# Alias tương thích ngược
save_to_csv = save_data


def crawl(
    page: Union[int, str, None] = 10,
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 1.0,
    max_delay: float = 2.0,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 6.0,
    posted_within: int = DEFAULT_POSTED_WITHIN,
    proxy: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Tiến trình crawl an toàn, thông minh chống bị khóa IP:
    - page: Mặc định là 10 (chỉ lấy 10 page). Nếu đặt 'max': cào đến hết thì thôi.
    - max_jobs_per_page: 'max' để lấy toàn bộ jobs trên trang, hoặc đặt số N để giới hạn.
    - Sử dụng độ trễ ngẫu nhiên (Polite Random Delay) giữa mỗi bài viết.
    - Khi máy chủ phát hiện hoặc chặn, tự động kích hoạt chế độ ngủ hồi phục (Exponential Backoff).
    - Tự động lưu lũy tiến vào CSV (UTF-8-sig) và JSON để không bao giờ bị mất dữ liệu.
    """
    limit_num: Optional[int] = None
    if isinstance(page, int):
        limit_num = page
    elif isinstance(page, str) and page.strip().isdigit():
        limit_num = int(page.strip())

    limit_jobs_per_page: Optional[int] = None
    if isinstance(max_jobs_per_page, int):
        limit_jobs_per_page = max_jobs_per_page
    elif isinstance(max_jobs_per_page, str) and max_jobs_per_page.strip().isdigit():
        limit_jobs_per_page = int(max_jobs_per_page.strip())

    base_url_with_filter = f"https://www.careerlink.vn/viec-lam/cntt-phan-mem/19?posted_within={posted_within}"
    logger.info(f"🚀 Bắt đầu crawl {SOURCE_NAME} (posted_within={posted_within})...")
    logger.info(
        f"⚙️  Cấu hình: Page = {limit_num if limit_num else 'MAX (Toàn bộ trang)'} | "
        f"Jobs/Page = {limit_jobs_per_page if limit_jobs_per_page else 'MAX (Toàn bộ)'} | "
        f"Delay = {min_delay}s - {max_delay}s | Cooldown = {batch_cooldown_seconds}s mỗi {batch_cooldown_every} jobs"
    )

    crawled_jobs: List[Dict[str, Any]] = []
    visited_job_urls = set()

    if HAS_CURL_CFFI:
        session = curl_requests.Session(impersonate="chrome120")
    else:
        session = curl_requests.Session()

    if proxy:
        session.proxies = {"http": proxy, "https": proxy}

    # Khởi tạo cookie session ban đầu từ trang chủ để tránh bị redirect
    try:
        session.get("https://www.careerlink.vn/", timeout=15)
        logger.info(f"🍪 [Session Init] Đã khởi tạo cookie session ban đầu: {list(session.cookies.keys())}")
    except Exception as e:
        logger.debug(f"Không thể khởi tạo cookie session ban đầu: {e}")

    current_page = 1
    job_counter = 0

    try:
        while True:
            if limit_num is not None and current_page > limit_num:
                logger.info(f"🏁 Đã đạt giới hạn tối đa {limit_num} trang được chỉ định. Dừng crawl.")
                break

            page_url = f"{base_url_with_filter}&page={current_page}"
            logger.info(f"\n📄 Đang tải trang danh sách #{current_page}: {page_url}")

            res = safe_request(session, page_url, max_retries=3, initial_backoff=5.0)
            if not res or res.status_code != 200:
                logger.warning(f"Không thể tải trang #{current_page}. Kết thúc crawl phân trang.")
                break

            # Kiểm tra redirect về trang chủ khi hết trang
            if current_page > 1 and str(res.url).rstrip("/").endswith(base_url_with_filter.rstrip("/")):
                logger.info(f"Website redirect về trang 1 tại page #{current_page}. Hoàn tất toàn bộ phân trang!")
                break

            soup = BeautifulSoup(res.text, "html.parser")
            job_urls = extract_job_urls_from_page(soup)
            page_title = soup.title.get_text(strip=True) if soup.title else "N/A"
            logger.info(
                f"📄 Phản hồi #{current_page}: HTTP {res.status_code} | URL: {res.url} | "
                f"{len(res.text)} bytes | Title: {page_title} | URLs tìm thấy: {len(job_urls)}"
            )

            # Nếu HTTP trả về 0 URLs tại trang 1: Thử link search thay thế hoặc Playwright Fallback
            if not job_urls and current_page == 1:
                alt_url = f"https://www.careerlink.vn/vieclam/tim-kiem-viec-lam?categories=19&page={current_page}"
                logger.info(f"🔄 Thử lại trang #{current_page} với endpoint search thay thế: {alt_url}")
                alt_res = safe_request(session, alt_url, max_retries=2, initial_backoff=3.0)
                if alt_res and alt_res.status_code == 200:
                    alt_soup = BeautifulSoup(alt_res.text, "html.parser")
                    alt_urls = extract_job_urls_from_page(alt_soup)
                    if alt_urls:
                        logger.info(f"✅ Thành công với endpoint search: tìm thấy {len(alt_urls)} jobs!")
                        job_urls = alt_urls
                        base_url_with_filter = "https://www.careerlink.vn/vieclam/tim-kiem-viec-lam?categories=19"

            # Nếu vẫn không có URLs (do WAF/Cloud Challenge hoặc client-side render): Kích hoạt Playwright Fallback
            if not job_urls:
                logger.info(f"⚡ Thử fallback sang Playwright Headless Browser cho trang #{current_page}...")
                pw_html = fetch_list_page_with_playwright(page_url, session=session)
                if pw_html:
                    pw_soup = BeautifulSoup(pw_html, "html.parser")
                    pw_urls = extract_job_urls_from_page(pw_soup)
                    if pw_urls:
                        logger.info(f"✅ Playwright Fallback thành công: tìm thấy {len(pw_urls)} jobs!")
                        job_urls = pw_urls

                # Nếu URL danh mục không ra trên Playwright, thử URL search tổng
                if not job_urls:
                    alt_pw_url = f"https://www.careerlink.vn/vieclam/tim-kiem-viec-lam?categories=19&page={current_page}"
                    logger.info(f"⚡ Thử fallback Playwright với search URL: {alt_pw_url}...")
                    alt_pw_html = fetch_list_page_with_playwright(alt_pw_url, session=session)
                    if alt_pw_html:
                        alt_pw_soup = BeautifulSoup(alt_pw_html, "html.parser")
                        alt_pw_urls = extract_job_urls_from_page(alt_pw_soup)
                        if alt_pw_urls:
                            logger.info(f"✅ Playwright Search Fallback thành công: tìm thấy {len(alt_pw_urls)} jobs!")
                            job_urls = alt_pw_urls

            if not job_urls:
                logger.info(f"Không tìm thấy việc làm nào ở trang #{current_page}. Đã cào hết toàn bộ trang!")
                break

            # Lọc trùng lặp
            new_job_urls = [u for u in job_urls if u not in visited_job_urls]
            for u in new_job_urls:
                visited_job_urls.add(u)

            if not new_job_urls:
                logger.info(f"Tất cả công việc ở trang #{current_page} đã được cào trước đó. Dừng phân trang.")
                break

            logger.info(f"Trang #{current_page}: Tìm thấy {len(new_job_urls)} việc làm mới.")

            # Giới hạn số jobs trên mỗi trang nếu được cấu hình
            if limit_jobs_per_page is not None and limit_jobs_per_page > 0:
                new_job_urls = new_job_urls[:limit_jobs_per_page]

            for idx, j_url in enumerate(new_job_urls, 1):
                job_counter += 1

                # Nghỉ xả hơi theo batch (Batch Cooldown)
                if job_counter > 1 and (job_counter % batch_cooldown_every == 0):
                    cooldown_jitter = batch_cooldown_seconds + random.uniform(1.0, 2.5)
                    logger.info(f"☕ [Batch Cooldown] Đã cào {job_counter} jobs. Tạm dừng {cooldown_jitter:.1f}s...")
                    time.sleep(cooldown_jitter)
                else:
                    sleep_time = random.uniform(min_delay, max_delay)
                    time.sleep(sleep_time)

                detail_res = safe_request(session, j_url, max_retries=3, initial_backoff=6.0, referer=page_url)
                
                # Kiểm tra nếu bị redirect về trang chủ (do thiếu hoặc hết hạn session cookie)
                is_redirected_to_home = False
                if detail_res and str(detail_res.url).rstrip("/") in ["https://www.careerlink.vn", "https://careerlink.vn"]:
                    is_redirected_to_home = True

                detail_soup = BeautifulSoup(detail_res.text, "html.parser") if (detail_res and not is_redirected_to_home) else None
                job_data = parse_job_detail(detail_soup, job_url=j_url) if detail_soup else {}

                # Nếu không bóc tách được job_title (hoặc bị redirect về trang chủ): Dùng Playwright tải chi tiết và đồng bộ lại cookie
                if not job_data.get("job_title"):
                    logger.info(f"  [#{idx}] Đang tải lại chi tiết bằng Playwright: {j_url}")
                    pw_detail_html = fetch_list_page_with_playwright(j_url, session=session)
                    if pw_detail_html:
                        detail_soup = BeautifulSoup(pw_detail_html, "html.parser")
                        job_data = parse_job_detail(detail_soup, job_url=j_url)

                if not job_data.get("job_title"):
                    logger.warning(f"  [#{idx}] Không bóc tách được job_title tại {j_url}. Bỏ qua.")
                    continue

                crawled_jobs.append(job_data)
                title_disp = (job_data.get("job_title") or "")[:40]
                kw_disp = job_data.get("keyword") or "N/A"
                logger.info(f"  ✅ [#{len(crawled_jobs)}] {title_disp} | Keyword: {kw_disp}")

                # Ghi dữ liệu liên tục vào CSV & JSON sau mỗi 5 job
                if len(crawled_jobs) % 5 == 0:
                    save_data(crawled_jobs)

            # Lưu sau mỗi trang hoàn tất
            save_data(crawled_jobs)
            current_page += 1

    finally:
        session.close()

    if crawled_jobs:
        save_data(crawled_jobs)

    logger.info(f"\n🎉 Hoàn thành xuất sắc! Đã cào tổng cộng {len(crawled_jobs)} jobs vào: {OUTPUT_CSV}")
    return crawled_jobs


if __name__ == "__main__":
    # CẤU HÌNH KHI CHẠY TRỰC TIẾP:
    # - page: Mặc định chỉ lấy 10 trang (hoặc đặt "max" để cào hết toàn bộ)
    # - max_jobs_per_page: "max" để lấy toàn bộ job trên trang (hoặc đặt số, vd: 3 để test nhanh)
    # - min_delay, max_delay: Thời gian nghỉ ngẫu nhiên giữa các bài đăng (chống chặn IP)

    results = crawl(
        page=10,                      # Mặc định lấy 10 page theo yêu cầu
        max_jobs_per_page="max",      # Lấy toàn bộ jobs trên mỗi trang
        min_delay=1.0,
        max_delay=2.0,
    )
    print(f"\n[{SOURCE_NAME}] Kết thúc! Đã lưu {len(results)} jobs vào {OUTPUT_CSV}")
