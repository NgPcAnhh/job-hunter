"""
Crawler for TopDev.vn (https://topdev.vn)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa theo cấu trúc DOM thực tế của TopDev.vn.

Cơ chế chống chặn IP & Anti-Bot tối ưu (Anti-Ban / Anti-Tarpit):
1. Giả lập TLS Fingerprint người thật: Sử dụng curl_cffi Session impersonate "chrome120" với đầy đủ Cookie jar.
2. Rotating User-Agents & Modern Sec-Ch-Ua Headers: Luân phiên User-Agent và Referer tự nhiên theo luồng duyệt.
3. Randomized Polite Delay & Jitter: Nghỉ ngẫu nhiên 1.2s - 2.5s giữa các lượt tải trang / bài đăng.
4. Batch Cooldown (Mô phỏng người dùng): Tự động nghỉ xả hơi (5s - 8s) sau mỗi 10 bài đăng để làm mới rate-limit window.
5. Phát hiện Captcha & Bot Challenge: Tự động phát hiện Cloudflare Turnstile, "Just a moment...", hCaptcha.
6. Exponential Backoff & Retry: Tự động hạ nhiệt, tăng gấp đôi thời gian chờ khi gặp mã 403, 429, 503 hoặc Timeout.
7. Xử lý HTTP 404/410: Tự động phát hiện và bỏ qua nhanh bài đăng đã hết hạn/bị xóa mà không tốn thời gian retry.
8. Incremental Auto-Save: Lưu liên tục dữ liệu ra file CSV (UTF-8-sig) và JSON sau mỗi trang, không lo mất dữ liệu.
9. Hỗ trợ tham số page="max" (cào đến hết) hoặc page=N (cào đến trang N), và max_jobs_per_page="max" / số lượng test.
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
from urllib.parse import urljoin, urlsplit, urlunsplit

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
    try:
        from db import upsert_jobs_to_source_table, upsert_jobs_to_supabase
    except ImportError:
        upsert_jobs_to_source_table = None
        upsert_jobs_to_supabase = None

# Cấu hình logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

SOURCE_NAME = "topdev"
BASE_DOMAIN = "https://topdev.vn"
# URL phân trang ngành IT phần mềm
BASE_PAGINATION_URL = "https://topdev.vn/jobs/search?job_categories_ids=2%2C3%2C4%2C5%2C6%2C7%2C8%2C9%2C10%2C11%2C12%2C13%2C67&page={page}"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "topdev.csv"
OUTPUT_JSON = OUTPUT_DIR / "topdev.json"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


def get_random_headers(referer: Optional[str] = None) -> Dict[str, str]:
    """Tạo bộ HTTP headers hoàn chỉnh mô phỏng trình duyệt Chrome người thật, đồng bộ Client Hints."""
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
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
    }
    if referer:
        headers["Referer"] = referer
    return headers


def safe_text(elem: Any, sep: str = " ") -> str:
    """Trích xuất text an toàn từ BeautifulSoup element, xóa khoảng trắng thừa."""
    if elem is None:
        return ""
    if hasattr(elem, "get_text"):
        return re.sub(r"[ \t]+", " ", elem.get_text(separator=sep, strip=True))
    return re.sub(r"[ \t]+", " ", str(elem).strip())


def clean_job_url(raw_url: str, base_url: str = BASE_DOMAIN) -> str:
    """
    Chuẩn hóa URL bài đăng:
    - Nối với base_url nếu là đường dẫn tương đối
    - Loại bỏ các query parameter rác / tracking (src, medium, utm_...)
    """
    if not raw_url:
        return ""
    full_url = urljoin(base_url, raw_url.strip())
    parsed = urlsplit(full_url)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def check_is_captcha_or_challenge(response) -> bool:
    """Phát hiện trang bị chặn bởi Cloudflare Turnstile, Bot Challenge hoặc Captcha."""
    if response is None:
        return False
    if response.status_code in [403, 429, 503]:
        return True
    lower_text = response.text.lower()
    challenge_indicators = [
        "just a moment...",
        "cf-browser-verification",
        "cf-turnstile",
        "challenge-platform",
        "g-recaptcha",
        "hcaptcha",
        "access denied",
        "security verification",
        "are you a robot",
        "vui lòng xác minh",
    ]
    return any(ind in lower_text for ind in challenge_indicators)


def create_crawler_session(proxy: Optional[str] = None):
    """Khởi tạo HTTP Session có khả năng giả lập TLS Fingerprint người thật."""
    if HAS_CURL_CFFI:
        session = curl_requests.Session(impersonate="chrome120")
    else:
        session = curl_requests.Session()

    if proxy:
        session.proxies = {"http": proxy, "https": proxy}

    return session


def fetch_with_retry(
    session,
    url: str,
    referer: Optional[str] = None,
    max_retries: int = 4,
    initial_backoff: float = 2.0,
    timeout: int = 15,
) -> Optional[Any]:
    """
    Tải URL với cơ chế Exponential Backoff & Anti-Bot Protection:
    - Thử lại khi gặp sự cố mạng, timeout hoặc rate-limit (429, 503, 403).
    - Tự động bỏ qua nhanh mã lỗi 404/410 mà không retry vô ích.
    """
    backoff = initial_backoff

    for attempt in range(1, max_retries + 1):
        try:
            headers = get_random_headers(referer=referer)

            if HAS_CURL_CFFI:
                response = session.get(url, headers=headers, timeout=timeout, impersonate="chrome120")
            else:
                response = session.get(url, headers=headers, timeout=timeout)

            # Bỏ qua ngay lập tức nếu link bài đăng đã bị xóa / không tồn tại
            if response.status_code in [404, 410]:
                logger.info(f"ℹ️ Bài đăng không tồn tại hoặc đã bị gỡ (HTTP {response.status_code}): {url}")
                return None

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


def get_job_links_from_page(html: str, base_url: str = BASE_DOMAIN) -> List[str]:
    """
    1. Hàm get_job_links_from_page(html, base_url="https://topdev.vn"):
    - Quét qua tất cả khối `div.flex.flex-col.justify-between` (Ảnh 1).
    - Bóc tách thuộc tính `href` của thẻ `a` bên trong chứa link chi tiết bài viết.
    - Dùng urllib.parse.urljoin và clean_job_url để chuẩn hóa thành URL tuyệt đối (loại bỏ params UTM/src không cần thiết).
    - Trả về `List[str]`.
    """
    soup = BeautifulSoup(html, "html.parser")
    job_urls: List[str] = []
    seen = set()

    for item in soup.select("div.flex.flex-col.justify-between"):
        a_elem = item.select_one('a[href*="/detail-jobs/"]')
        if not a_elem:
            continue

        raw_href = a_elem.get("href")
        if not raw_href:
            continue

        clean_url = clean_job_url(raw_href, base_url=base_url)
        if clean_url and clean_url not in seen and "/detail-jobs/" in clean_url:
            seen.add(clean_url)
            job_urls.append(clean_url)

    # Fallback dự phòng: quét toàn bộ thẻ a có href chứa /detail-jobs/ trên trang
    if not job_urls:
        for a_elem in soup.select('a[href*="/detail-jobs/"]'):
            raw_href = a_elem.get("href")
            if not raw_href:
                continue
            clean_url = clean_job_url(raw_href, base_url=base_url)
            if clean_url and clean_url not in seen:
                seen.add(clean_url)
                job_urls.append(clean_url)

    return job_urls


def get_job_cards_metadata(html: str, base_url: str = BASE_DOMAIN) -> Dict[str, Dict[str, str]]:
    """
    Trích xuất metadata bổ trợ từ các card ở trang danh sách (Ảnh 1):
    - job_url: Link chi tiết công việc
    - job_title_list: Text của thẻ `a` tiêu đề bài viết
    - company_name_list: Text của thẻ `span` chứa tên công ty ngay bên dưới
    """
    soup = BeautifulSoup(html, "html.parser")
    meta_dict: Dict[str, Dict[str, str]] = {}

    for item in soup.select("div.flex.flex-col.justify-between"):
        a_elem = item.select_one('a[href*="/detail-jobs/"]')
        if not a_elem:
            continue

        raw_href = a_elem.get("href")
        if not raw_href:
            continue

        clean_url = clean_job_url(raw_href, base_url=base_url)
        if not clean_url:
            continue

        job_title_list = safe_text(a_elem)
        span_com = item.select_one("span.line-clamp-1, span")
        company_name_list = safe_text(span_com) if span_com else ""

        meta_dict[clean_url] = {
            "job_url": clean_url,
            "job_title_list": job_title_list,
            "company_name_list": company_name_list,
        }

    return meta_dict


def parse_job_detail(
    html: str,
    job_url: str,
    fallback_card: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    2. Hàm parse_job_detail(html, job_url):
    Trích xuất an toàn và trả về một Python Dictionary theo schema đồng bộ:
    - job_url: URL của job đang cào
    - source: Gán cố định "topdev"
    - job_title: Text trong thẻ h1 tiêu đề (hoặc fallback)
    - salary: Mặc định chuỗi rỗng "" (do web hiển thị "Login to view salary")
    - location_short: Lấy text khu vực (Hà Nội, Hồ Chí Minh...)
    - level: Lấy text cấp bậc (ví dụ: "Chuyên viên", "Trưởng nhóm")
    - experience: Lấy text kinh nghiệm (ví dụ: "3 years")
    - deadline: Lấy text hạn nộp hồ sơ hoặc thời gian còn lại (ví dụ: "3 days left")
    - company_name: Text tiêu đề công ty từ cột bên phải
    - company_logo: Thuộc tính src của thẻ img logo công ty
    - job_description: Tìm khối "Your role & responsibilities", gom text li/p nối bằng \n
    - job_requirements: Tìm khối "Your skills & qualifications", gom text li/p nối bằng \n
    - benefits: Tìm khối "Benefits", gom toàn bộ text nội dung bên trong nối bằng \n
    - keyword: Gom text các thẻ a kỹ năng nối lại dạng {kw_1} {kw_2}
    """
    soup = BeautifulSoup(html, "html.parser")
    clean_url = clean_job_url(job_url, base_url=BASE_DOMAIN)

    # 1. Job ID
    job_id = ""
    id_match = re.search(r"-(\d+)$", clean_url)
    if id_match:
        job_id = id_match.group(1)

    # 2. Job Title (Ảnh 2 & 3: h1 tiêu đề)
    title_elem = soup.select_one(
        "h1, "
        "div[class*='md:sticky'] a[class*='font-semibold'], "
        "div.flex.w-full.flex-col a[class*='font-semibold'], "
        "a[class*='text-[18px]/[28px]'], "
        "a[class*='text-[24px]/[40px]']"
    )
    job_title = safe_text(title_elem)
    if not job_title:
        # Fallback từ meta tag
        meta_t = soup.select_one('meta[property="og:title"], title')
        if meta_t:
            raw_t = meta_t.get("content") or meta_t.get_text()
            m = re.search(r"Recruiting\s+(.+?)\s+at\s+", raw_t, re.IGNORECASE)
            if m:
                job_title = m.group(1).strip()
            else:
                job_title = raw_t.split("|")[0].replace("Tuyển dụng", "").strip()

    if not job_title and fallback_card:
        job_title = fallback_card.get("job_title_list", "")

    # 3. Thuộc tính nhanh (Ảnh 2 & 3: location_short, level, experience, deadline)
    salary = ""  # Mặc định chuỗi rỗng do TopDev yêu cầu login để xem lương
    location_short = ""
    level = ""
    experience = ""
    deadline = ""

    # Quét khối thuộc tính nhanh trong grid hoặc flex container
    for span in soup.select(
        "div[class*='grid'] span.line-clamp-1, "
        "div.md\\:sticky span.line-clamp-1, "
        "div[class*='md:my-2'] span, "
        "div.flex.w-full.flex-col span.line-clamp-1"
    ):
        txt = safe_text(span)
        if not txt or len(txt) > 60:
            continue
        low = txt.lower()

        # Địa điểm làm việc
        if any(c in low for c in ["hà nội", "hồ chí minh", "đà nẵng", "remote", "hybrid", "hcm", "ha noi", "vietnam"]):
            if not location_short:
                location_short = txt
        # Cấp bậc
        elif any(c in low for c in ["chuyên viên", "trưởng nhóm", "nhân viên", "quản lý", "intern", "fresher", "junior", "middle", "senior", "lead", "manager", "director"]):
            if not level:
                level = txt
        # Kinh nghiệm
        elif any(c in low for c in ["year", "năm", "tháng", "month", "no experience"]):
            if not experience:
                experience = txt

    # Hạn nộp / deadline (Ảnh 2 & 3: "3 days left", "hạn nộp", ngày tháng)
    for span in soup.select("div[class*='text-text-400'] span, div[class*='md:sticky'] span, div.flex.w-full.flex-col span"):
        txt = safe_text(span)
        if not txt:
            continue
        low = txt.lower()
        if "left" in low or "hạn" in low or re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{4}", txt):
            m = re.search(r"(\d+\s+(?:days?|ngày)\s+left|\d{1,2}[/-]\d{1,2}[/-]\d{4}|[Hh]ạn\s+nộp\s+[\d\w\s/-]+)", txt, re.IGNORECASE)
            if m:
                deadline = m.group(1).strip()
            else:
                deadline = txt.replace("Applicants", "").strip()
            break

    # 4. Thông tin công ty & Logo (Ảnh 2 & 3: Cột phải)
    company_name = ""
    company_url = ""
    company_logo = ""

    # Tìm liên kết và tên công ty trong khối công ty bên phải
    for a in soup.select('a[href*="/companies/"]'):
        href = a.get("href", "")
        if "/group/" in href or "mainmenu" in href:
            continue
        name_el = a.select_one('span[class*="font-semibold"], h3, h2')
        if name_el:
            company_name = safe_text(name_el)
        elif a.get_text(strip=True) and "view company" not in a.get_text(strip=True).lower():
            company_name = safe_text(a)

        if company_name:
            company_url = urljoin(BASE_DOMAIN, href)
            break

    # Logo công ty (Ưu tiên logo vuông trong cột thông tin công ty bên phải)
    for img in soup.select(
        'img[class*="rounded-[4px]"][class*="object-contain"], '
        'img[class*="h-[72px]"], '
        'img[alt="job-image"], '
        'div[class*="top-[6"] img.object-contain, '
        'div.sticky img.object-contain, '
        'img.object-contain'
    ):
        raw_src = img.get("src") or img.get("data-src") or ""
        if not raw_src:
            continue
        # Bỏ qua ảnh bìa/banner, system icons và trackers
        if any(skip in raw_src.lower() for skip in ["logo_v2", "saramin-icon", "facebook.com", "promote_app", "data:image", "cover", "1258x256"]):
            continue
        company_logo = urljoin(BASE_DOMAIN, raw_src.strip())
        break

    # Fallback tên công ty từ card danh sách nếu detail page chưa tìm thấy
    if not company_name and fallback_card:
        company_name = fallback_card.get("company_name_list", "")

    # 5. Khối nội dung chi tiết: Mô tả, Yêu cầu, Phúc lợi (Ảnh 4 & 5)
    job_description = ""
    job_requirements = ""
    benefits = ""

    for span_head in soup.select("span[class*='text-[#3659B3]'], span[class*='font-semibold'], h2, h3"):
        head_text = safe_text(span_head).lower()
        nxt = span_head.find_next_sibling("div")
        if not nxt:
            continue

        # Gom text ưu tiên các thẻ li, fallback toàn bộ đoạn văn p / text
        lis = nxt.select("ul li, ol li, li")
        if lis:
            content = "\n".join([safe_text(li) for li in lis if safe_text(li)])
        else:
            content = safe_text(nxt, sep="\n")

        if not content:
            continue

        # 1. Your role & responsibilities
        if ("role & responsibilities" in head_text or "mô tả" in head_text or "1 your role" in head_text) and not job_description:
            job_description = content
        # 2. Your skills & qualifications
        elif ("skills & qualifications" in head_text or "yêu cầu" in head_text or "2 your skills" in head_text) and not job_requirements:
            job_requirements = content
        # 3. Benefits
        elif ("benefits" in head_text or "phúc lợi" in head_text or "quyền lợi" in head_text or "3 benefits" in head_text) and not benefits:
            benefits = content

    # 6. Từ khóa kỹ năng / Tags (Ảnh 6)
    keywords: List[str] = []
    for a in soup.select("a[class*='rounded-[64px]'], a[class*='rounded-full'], a[class*='border-brand-500']"):
        txt = safe_text(a).replace(",", "").strip()
        if txt and txt not in keywords and txt not in ["Tải App", "Apply", "Share", "View company"]:
            keywords.append(txt)

    keyword_str = " ".join([f"{{{k}}}" for k in keywords])

    return {
        "job_url": clean_url,
        "job_id": job_id,
        "job_title": job_title,
        "company_name": company_name,
        "company_url": company_url,
        "company_logo": company_logo,
        "salary": salary,
        "location": location_short,
        "location_short": location_short,
        "workplace_detail": location_short,
        "experience": experience,
        "education": "",
        "work_type": "",
        "level": level,
        "deadline": deadline,
        "posted_date": "",
        "recruitment_num": "",
        "keyword": keyword_str,
        "job_description": job_description,
        "job_requirements": job_requirements,
        "benefits": benefits,
        "source": SOURCE_NAME,
    }


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu ra cả CSV chuẩn UTF-8-sig và JSON UTF-8, đồng thời lưu vào Supabase Database nếu có."""
    if not jobs:
        logger.warning("Không có dữ liệu để lưu.")
        return

    csv_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Lưu CSV (UTF-8 with BOM để tương thích hoàn hảo Excel tiếng Việt)
    fieldnames = list(jobs[0].keys())
    with open(csv_path, mode="w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(jobs)
    logger.info(f"💾 [CSV đã lưu] {len(jobs)} jobs -> {csv_path}")

    # 2. Lưu JSON
    with open(json_path, mode="w", encoding="utf-8") as f:
        json.dump(jobs, f, ensure_ascii=False, indent=2)
    logger.info(f"💾 [JSON đã lưu] {len(jobs)} jobs -> {json_path}")

    # 3. Đồng bộ hóa vào cơ sở dữ liệu Supabase nếu có
    if upsert_jobs_to_source_table:
        try:
            upsert_jobs_to_source_table(jobs, SOURCE_NAME)
        except Exception as e:
            logger.debug(f"Không thể upsert vào bảng nguồn: {e}")


def crawl(
    page: Union[int, str, None] = 10,
    max_pages: Optional[Union[int, str]] = None,
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 1.2,
    max_delay: float = 2.5,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 6.0,
    proxy: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Tiến trình cào dữ liệu TopDev.vn hoàn chỉnh:
    - Tham số page / max_pages:
        + Mặc định: 10 trang.
        + Nếu đặt "max" (hoặc None): cào liên tục tất cả các trang cho tới khi không còn bài tuyển dụng nào hoặc lặp trang.
        + Nếu đặt số (ví dụ: page=10): chỉ cào từ trang 1 đến hết trang 10 thì dừng.
    - Tham số max_jobs_per_page:
        + Mặc định: "max" (cào toàn bộ jobs trên mỗi trang).
        + Nếu đặt số (ví dụ: 3): chỉ lấy số lượng job tương ứng trên mỗi trang để test nhanh.
    - Cơ chế an toàn:
        + TLS Impersonate chrome120.
        + Random polite delay (1.2s - 2.5s) giữa các request.
        + Batch cooldown nghỉ 6s sau mỗi 10 bài để giải phóng rate limit.
        + Tự động dừng khi trang lặp lại (trang vượt ngưỡng tối đa).
        + Lưu dữ liệu lũy tiến ra CSV và JSON sau mỗi trang.
    """
    # Xử lý đồng bộ giá trị page và max_pages
    target_pages_raw = max_pages if max_pages is not None else page
    crawl_until_the_end = False
    stop_at_page = 10

    if str(target_pages_raw).strip().lower() in ["max", "all", "none", "0", ""]:
        crawl_until_the_end = True
        logger.info("⚡ Chế độ: Cào TOÀN BỘ danh sách bài đăng TopDev.vn cho đến trang cuối cùng.")
    else:
        try:
            stop_at_page = int(target_pages_raw)
            logger.info(f"🎯 Chế độ: Cào có giới hạn từ trang 1 đến trang {stop_at_page}.")
        except (ValueError, TypeError):
            stop_at_page = 10
            logger.info(f"🎯 Tham số trang không hợp lệ, chuyển về mặc định 10 trang.")

    # Giới hạn số lượng job mỗi page
    jobs_limit_per_page: Optional[int] = None
    if max_jobs_per_page is not None and str(max_jobs_per_page).strip().lower() not in ["max", "all", "none", ""]:
        try:
            jobs_limit_per_page = int(max_jobs_per_page)
            logger.info(f"🔬 Chế độ giới hạn bài test: Lấy tối đa {jobs_limit_per_page} bài / trang.")
        except (ValueError, TypeError):
            jobs_limit_per_page = None

    session = create_crawler_session(proxy=proxy)
    all_jobs: List[Dict[str, Any]] = []
    seen_urls = set()
    current_page = 1
    total_processed_count = 0

    while True:
        if not crawl_until_the_end and current_page > stop_at_page:
            logger.info(f"🏁 Đã đạt số trang mục tiêu ({stop_at_page}). Dừng cào dữ liệu.")
            break

        page_url = BASE_PAGINATION_URL.format(page=current_page)
        logger.info(f"\n📄 [Trang {current_page}] Đang tải danh sách bài tuyển dụng: {page_url}")

        resp = fetch_with_retry(session, page_url)
        if not resp or resp.status_code != 200:
            logger.warning(f"⚠️ Không thể tải trang {current_page} (HTTP {getattr(resp, 'status_code', 'None')}). Kết thúc tiến trình.")
            break

        # Bóc tách link bài tuyển dụng từ trang danh sách
        job_urls = get_job_links_from_page(resp.text, base_url=BASE_DOMAIN)
        card_metadata = get_job_cards_metadata(resp.text, base_url=BASE_DOMAIN)

        if not job_urls:
            logger.info(f"🛑 Trang {current_page} không còn bài tuyển dụng nào. Đã đến trang cuối.")
            break

        # Kiểm tra lặp trang (khi page vượt ngưỡng, TopDev lặp lại bài đăng trang cuối)
        new_page_urls = [u for u in job_urls if u not in seen_urls]
        if not new_page_urls:
            logger.info(f"🛑 Tất cả bài đăng tại trang {current_page} đã được cào trước đó. Đã cào hết dữ liệu.")
            break

        logger.info(f"🔍 Tìm thấy {len(job_urls)} bài viết (có {len(new_page_urls)} bài mới) trên trang {current_page}.")

        # Áp dụng giới hạn số lượng jobs mỗi page nếu có cấu hình
        if jobs_limit_per_page is not None and jobs_limit_per_page > 0:
            target_page_urls = new_page_urls[:jobs_limit_per_page]
        else:
            target_page_urls = new_page_urls

        # Cào chi tiết từng bài viết
        for idx, j_url in enumerate(target_page_urls, start=1):
            seen_urls.add(j_url)
            logger.info(f"  -> [{idx}/{len(target_page_urls)}] Đang cào: {j_url}")

            detail_resp = fetch_with_retry(session, j_url, referer=page_url)
            if not detail_resp or detail_resp.status_code != 200:
                logger.warning(f"  ⚠️ Bỏ qua bài đăng lỗi: {j_url}")
                continue

            fb_card = card_metadata.get(j_url)
            job_data = parse_job_detail(detail_resp.text, j_url, fallback_card=fb_card)
            all_jobs.append(job_data)
            total_processed_count += 1

            # Randomized Polite Delay (1.2s - 2.5s)
            delay = random.uniform(min_delay, max_delay)
            time.sleep(delay)

            # Batch Cooldown: Tự động nghỉ xả hơi (6s) sau mỗi 10 bài để giải phóng rate-limit window
            if total_processed_count % batch_cooldown_every == 0:
                logger.info(f"☕ [Cooldown] Đã tải {total_processed_count} bài đăng. Tạm nghỉ {batch_cooldown_seconds:.1f}s...")
                time.sleep(batch_cooldown_seconds)

        # Lưu dữ liệu lũy tiến sau mỗi trang để phòng sự cố gián đoạn
        save_data(all_jobs)
        current_page += 1

        # Nghỉ nhẹ giữa các trang danh sách
        time.sleep(random.uniform(1.0, 2.0))

    logger.info(f"\n🎉 [Hoàn thành] Đã thu thập thành công tổng cộng {len(all_jobs)} công việc từ TopDev.vn.")
    return all_jobs


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TopDev.vn Job Crawler")
    parser.add_argument(
        "--pages",
        "-p",
        type=str,
        default="10",
        help="Số lượng trang cần cào (ví dụ: 5, 10) hoặc 'max' để cào toàn bộ.",
    )
    parser.add_argument(
        "--jobs-per-page",
        "-j",
        type=str,
        default="max",
        help="Số lượng jobs cào trên mỗi trang (ví dụ: 3 để test nhanh, 'max' để cào toàn bộ).",
    )
    parser.add_argument(
        "--proxy",
        type=str,
        default=None,
        help="HTTP/HTTPS Proxy (ví dụ: http://user:pass@host:port)",
    )

    args = parser.parse_args()

    crawl(
        page=args.pages,
        max_jobs_per_page=args.jobs_per_page,
        proxy=args.proxy,
    )
