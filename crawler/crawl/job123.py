"""
Crawler for 123job.vn (https://123job.vn)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa theo cấu trúc DOM thực tế của 123job.vn.

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

SOURCE_NAME = "123job"
BASE_DOMAIN = "https://123job.vn"
# URL phân trang ngành IT phần mềm
BASE_PAGINATION_URL = "https://123job.vn/nganh-nghe/vi%E1%BB%87c-l%C3%A0m-it-ph%E1%BA%A7n-m%E1%BB%81m?cat=IT+ph%E1%BA%A7n+m%E1%BB%81m&sort=new&cat_name=IT+ph%E1%BA%A7n+m%E1%BB%81m&page={page}"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "123job.csv"
OUTPUT_JSON = OUTPUT_DIR / "123job.json"

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
    """Trích xuất chuỗi văn bản an toàn, loại bỏ khoảng trắng thừa."""
    if elem is None:
        return ""
    if hasattr(elem, "get_text"):
        return elem.get_text(separator=sep, strip=True)
    return str(elem).strip()


def clean_job_url(raw_url: str, base_url: str = BASE_DOMAIN) -> str:
    """Chuẩn hóa URL bài đăng thành link tuyệt đối, loại bỏ các tham số tracking như ?pos=... hay ?codePosition=..."""
    if not raw_url:
        return ""
    full_url = urljoin(base_url, raw_url.strip())
    # Loại bỏ query parameters để tạo canonical URL tránh trùng lặp
    parts = urlsplit(full_url)
    clean_url = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    return clean_url


def check_is_captcha_or_challenge(response: Any) -> bool:
    """Kiểm tra xem phản hồi có phải là trang thử thách Bot / Captcha không."""
    if not response or not hasattr(response, "text"):
        return False

    if response.status_code in [403, 429]:
        return True

    text_sample = response.text.lower()[:3000]
    indicators = [
        "cf-turnstile",
        "cf-challenge",
        "g-recaptcha",
        "hcaptcha",
        "checking your browser",
        "access denied",
        "blocked",
        "just a moment...",
    ]
    return any(ind in text_sample for ind in indicators)


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


def safe_request(
    session: Any,
    url: str,
    max_retries: int = 3,
    initial_backoff: float = 2.0,
    referer: Optional[str] = None,
) -> Optional[Any]:
    """
    Gửi request an toàn với cơ chế Exponential Backoff & Retry:
    - Xử lý các lỗi mạng tạm thời hoặc gián đoạn kết nối.
    - Xử lý mã phản hồi 403 (Forbidden), 429 (Too Many Requests), 503 (Service Unavailable).
    - Tự động bỏ qua bài đăng 404 (Not Found) hoặc 410 (Gone) mà không tốn công retry.
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

            # Nếu bài đăng đã hết hạn hoặc bị xóa -> Bỏ qua ngay
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


def get_job_links_from_page(html: str, base_url: str = BASE_DOMAIN) -> List[str]:
    """
    Quét qua danh sách các khối `div.job__list-item` (Ảnh 1).
    Lấy thuộc tính `href` trong thẻ `h2.job__list-item-title a`, chuẩn hóa thành link tuyệt đối và loại bỏ tracking query params.
    Trả về `List[str]`.
    """
    soup = BeautifulSoup(html, "html.parser")
    job_items = soup.select("div.job__list-item")
    job_urls: List[str] = []
    seen = set()

    for item in job_items:
        a_tag = item.select_one("h2.job__list-item-title a, .job__list-item-title a")
        if not a_tag or not a_tag.get("href"):
            continue

        raw_href = a_tag.get("href").strip()
        clean_url = clean_job_url(raw_href, base_url=base_url)

        if clean_url and clean_url not in seen:
            seen.add(clean_url)
            job_urls.append(clean_url)

    return job_urls


def get_job_cards_metadata(html: str, base_url: str = BASE_DOMAIN) -> Dict[str, Dict[str, str]]:
    """
    Trích xuất metadata bổ trợ từ các card ở trang danh sách (Ảnh 1):
    - job_id: Thuộc tính data-id của div.job__list-item
    - job_title_list: Tiêu đề công việc sơ bộ
    - company_name_list: Tên công ty sơ bộ
    """
    soup = BeautifulSoup(html, "html.parser")
    job_items = soup.select("div.job__list-item")
    metadata_map: Dict[str, Dict[str, str]] = {}

    for item in job_items:
        try:
            a_tag = item.select_one("h2.job__list-item-title a, .job__list-item-title a")
            if not a_tag or not a_tag.get("href"):
                continue

            raw_href = a_tag.get("href").strip()
            clean_url = clean_job_url(raw_href, base_url=base_url)

            job_id = item.get("data-id") or ""
            title_text = a_tag.get("title") or safe_text(a_tag)

            comp_elem = item.select_one("div.job__list-item-company a, div.job__list-item-company")
            comp_name = safe_text(comp_elem)

            metadata_map[clean_url] = {
                "job_id": job_id,
                "job_title_list": title_text,
                "company_name_list": comp_name,
            }
        except Exception:
            continue

    return metadata_map


def extract_keywords(soup: BeautifulSoup) -> str:
    """
    Trích xuất danh sách từ khóa / keywords từ khối `div.content-group.box-tags` (Ảnh 4):
    - Quét qua các thẻ <a> bên trong khối tags (ưu tiên h3.link_a a)
    - Loại bỏ dấu phẩy ',' và khoảng trắng thừa
    - Loại bỏ trùng lặp giữ nguyên thứ tự xuất hiện
    - Lưu dưới định dạng chuẩn: '{kw_1} {kw_2} ...' trong cột 'keyword'
    """
    keywords: List[str] = []

    # 1. Tìm các thẻ link từ khóa liên quan
    tag_links = soup.select(
        "div.content-group.box-tags h3.link_a a, "
        "div.box-tags h3.link_a a, "
        "div.content-group.box-tags a, "
        "div.box-tags a"
    )

    for a in tag_links:
        txt = a.get_text(strip=True).replace(",", "").strip()
        if txt and txt not in keywords:
            keywords.append(txt)

    if not keywords:
        return ""

    return " ".join([f"{{{kw}}}" for kw in keywords])


def parse_job_detail(detail_html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách an toàn và đầy đủ các trường dữ liệu từ DOM bài đăng 123job.vn:
    - Tiêu đề & Header (Ảnh 2):
        + job_title: Text của thẻ h1.js-job-title (hoặc strong bên trong)
    - Khối 3 thông số nhanh (Ảnh 2: div.attr-item-head):
        + salary: .value của .attr-item có .text chứa "Mức lương"
        + location_short: .value của .attr-item có .text chứa "Địa điểm làm việc"
        + experience: .value của .attr-item có .text chứa "Kinh nghiệm yêu cầu"
    - Khối công ty cột phải (#tab-company):
        + company_name: Text trong h2.company-name a hoặc div.company-name h2
        + company_logo: Thuộc tính src hoặc data-src của img.company-logo
    - Mô tả & Quyền lợi (#tab-info -> div.content-group - Ảnh 3):
        + job_description: .content-group__content có tiêu đề h2 "Mô tả công việc"
        + benefits: .content-group__content có tiêu đề h2 "Quyền lợi"
        + job_requirements: .content-group__content có tiêu đề h2 "Yêu cầu" (nếu có)
    - Từ khóa / Tags (div.content-group.box-tags - Ảnh 4):
        + keyword: Định dạng '{kw_1} {kw_2}' từ danh sách tag liên quan
    - Đặc điểm công việc (div.attr-item-groups - Ảnh 5):
        + deadline: Giá trị tương ứng của "Hạn nộp hồ sơ"
        + work_type: Giá trị tương ứng của "Hình thức làm việc"
        + level: Giá trị tương ứng của "Cấp bậc"
        + education: Giá trị tương ứng của "Trình độ yêu cầu"
        + recruitment_num: Giá trị tương ứng của "Số lượng cần tuyển"
        + profession: Giá trị tương ứng của "Ngành nghề"
        + location: Giá trị tương ứng của "Khu vực"
    """
    soup = BeautifulSoup(detail_html, "html.parser")

    # Loại bỏ các nút collapse "Xem thêm" để tránh dính chữ rác vào nội dung
    for btn in soup.select(".btn-collapse, .js-btn-collapse"):
        btn.decompose()

    # 1. Tiêu đề công việc (Ảnh 2)
    h1_elem = soup.select_one("h1.js-job-title, h1")
    job_title = safe_text(h1_elem)

    # Kiểm tra bài đăng đã đóng hoặc không tồn tại (404 Not Found)
    if not job_title or "không tồn tại" in job_title.lower() or "404" in job_title.lower():
        logger.warning(f"Bài tuyển dụng đã đóng hoặc trang không tồn tại: {job_url}")
        return {}

    # Trích xuất job_id từ URL nếu có slug code (ví dụ: -0q77eQZOq8)
    job_id = ""
    id_match = re.search(r"-([a-zA-Z0-9]+)(?:\?|$)", job_url)
    if id_match:
        job_id = id_match.group(1)

    # 2. Khối 3 thông số nhanh (Ảnh 2: div.attr-item-head)
    salary = ""
    location_short = ""
    experience = ""

    for item in soup.select("div.attr-item-head div.attr-item, .attr-item-head .attr-item"):
        label = safe_text(item.select_one(".text")).lower()
        val = safe_text(item.select_one(".value"))

        if "lương" in label:
            salary = val
        elif "địa điểm" in label:
            location_short = val
        elif "kinh nghiệm" in label:
            experience = val

    # 3. Khối thông tin công ty bên cột phải (#tab-company)
    company_name = ""
    company_url = ""
    company_logo = ""

    # Tìm tên công ty từ nhiều biến thể cấu trúc (ưu tiên thẻ h2 bên trong)
    comp_name_el = soup.select_one(
        "#tab-company .company-name h2, "
        "#tab-company h2.company-name a, "
        "#tab-company h2.company-name, "
        ".company-name h2, .company-name a"
    )
    if not comp_name_el:
        comp_name_el = soup.select_one("#tab-company div.company-name, .company-name")

    if comp_name_el:
        raw_name = safe_text(comp_name_el)
        company_name = re.split(r"\s*(?:Quy mô|Trụ sở):", raw_name, flags=re.IGNORECASE)[0].strip()

    # Link trang công ty (nếu có)
    comp_a = soup.select_one("#tab-company a[href*='/cong-ty/'], .company-name a")
    if comp_a and comp_a.get("href"):
        company_url = urljoin(BASE_DOMAIN, comp_a.get("href").strip())

    # Logo công ty
    logo_el = soup.select_one("#tab-company img.company-logo, img.company-logo")
    if logo_el:
        raw_logo = logo_el.get("src") or logo_el.get("data-src") or ""
        if raw_logo and "no_company.png" not in raw_logo:
            company_logo = urljoin(BASE_DOMAIN, raw_logo.strip())
        if not company_name and logo_el.get("alt"):
            company_name = logo_el.get("alt").strip()

    # 4. Mô tả & Quyền lợi công việc (#tab-info -> div.content-group - Ảnh 3)
    job_description = ""
    benefits = ""
    job_requirements = ""

    for cg in soup.select("#tab-info div.content-group, div.content-group"):
        h2 = cg.select_one("h2.content-group__title, h2")
        content_el = cg.select_one(".content-group__content")
        if not h2 or not content_el:
            continue

        h2_txt = safe_text(h2).lower()
        content_text = safe_text(content_el, sep="\n")

        if "mô tả" in h2_txt:
            job_description = content_text
        elif "quyền lợi" in h2_txt or "chế độ" in h2_txt:
            benefits = content_text
        elif "yêu cầu" in h2_txt:
            job_requirements = content_text

    # 5. Từ khóa / Tags (Ảnh 4)
    keyword = extract_keywords(soup)

    # 6. Đặc điểm công việc (div.attr-item-groups - Ảnh 5)
    deadline = ""
    work_type = ""
    level = ""
    education = ""
    recruitment_num = ""
    profession = ""
    location_detail = ""

    for ag in soup.select("div.attr-item-groups .attr-item, .attr-item-groups .attr-item"):
        name_attr = safe_text(ag.select_one(".name-attr")).lower()
        text_attr = safe_text(ag.select_one(".text-attr"))

        if "hạn nộp" in name_attr:
            deadline = text_attr
        elif "hình thức" in name_attr:
            work_type = text_attr
        elif "cấp bậc" in name_attr:
            level = text_attr
        elif "trình độ" in name_attr:
            education = text_attr
        elif "số lượng" in name_attr:
            recruitment_num = text_attr
        elif "ngành nghề" in name_attr:
            profession = text_attr
        elif "khu vực" in name_attr:
            location_detail = text_attr

    location = location_detail if location_detail else location_short

    return {
        "job_url": job_url,
        "job_id": job_id,
        "job_title": job_title,
        "company_name": company_name,
        "company_url": company_url,
        "company_logo": company_logo,
        "salary": salary,
        "location": location,
        "location_short": location_short,
        "experience": experience,
        "education": education,
        "work_type": work_type,
        "level": level,
        "keyword": keyword,
        "deadline": deadline,
        "recruitment_num": recruitment_num,
        "profession": profession,
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
    Tiến trình cào dữ liệu 123job.vn hoàn chỉnh:
    - Tham số page / max_pages:
        + Mặc định: 10 trang.
        + Nếu đặt "max" (hoặc None): cào liên tục tất cả các trang cho tới khi không còn bài tuyển dụng nào hoặc status khác 200.
        + Nếu đặt số (ví dụ: page=10): chỉ cào từ trang 1 đến hết trang 10 thì dừng.
    - Tham số max_jobs_per_page:
        + Mặc định: "max" (cào toàn bộ jobs trên mỗi trang).
        + Nếu đặt số (ví dụ: 3): chỉ lấy số lượng job tương ứng trên mỗi trang để test nhanh.
    - Trích xuất chuyên sâu Ngành nghề / Keyword:
        + Lưu dưới định dạng '{a} {b} {c}' trong cột 'keyword', loại bỏ dấu phẩy ','.
    - Session lưu Cookies tự nhiên như người dùng mở trình duyệt thật (TLS Chrome 120).
    - Duyệt từng bài viết kèm Randomized Polite Delay (mặc định 1.2s - 2.5s).
    - Batch Cooldown: Sau mỗi 10 bài viết, tạm dừng 6.0s để làm mới rate-limit window.
    - Tự động lưu lũy tiến dữ liệu ra file CSV và JSON sau mỗi trang hoàn tất.
    """
    # Phân giải tham số page / max_pages
    raw_limit = max_pages if max_pages is not None else page
    limit_num: Optional[int] = None

    if isinstance(raw_limit, str):
        raw_str = raw_limit.strip().lower()
        if raw_str in ["max", "all", "none", "full", "-1"]:
            limit_num = None
        elif raw_str.isdigit():
            limit_num = int(raw_str)
        else:
            logger.warning(f"Tham số page='{raw_limit}' không hợp lệ. Mặc định cào hết ('max').")
            limit_num = None
    elif isinstance(raw_limit, (int, float)):
        limit_num = int(raw_limit) if raw_limit > 0 else None
    else:
        limit_num = None

    # Phân giải tham số max_jobs_per_page
    limit_jobs_per_page: Optional[int] = None
    if isinstance(max_jobs_per_page, int):
        limit_jobs_per_page = max_jobs_per_page
    elif isinstance(max_jobs_per_page, str) and max_jobs_per_page.strip().isdigit():
        limit_jobs_per_page = int(max_jobs_per_page.strip())

    logger.info(f"🚀 Bắt đầu crawl 123job.vn: {BASE_PAGINATION_URL.format(page=1)}")
    if limit_num is not None:
        logger.info(f"🎯 Giới hạn trang: Cào tối đa đến trang #{limit_num}.")
    else:
        logger.info("🎯 Chế độ phân trang: 'max' (Cào liên tục đến khi hết toàn bộ trang).")

    logger.info(
        f"🛡️  [Anti-Ban Kích Hoạt] TLS Chrome120 | Delay {min_delay}s - {max_delay}s | "
        f"Cooldown {batch_cooldown_seconds}s mỗi {batch_cooldown_every} jobs | "
        f"Jobs/Page = {limit_jobs_per_page if limit_jobs_per_page else 'MAX (Toàn bộ)'}"
    )

    session = create_session(proxy=proxy)
    all_jobs: List[Dict[str, Any]] = []
    visited_urls = set()
    job_counter = 0
    current_page = 1
    last_referer: Optional[str] = None

    while True:
        if limit_num is not None and current_page > limit_num:
            logger.info(f"Đã hoàn thành cào đến trang #{limit_num}. Dừng crawl.")
            break

        list_url = BASE_PAGINATION_URL.format(page=current_page)
        logger.info(f"\n📄 Đang tải trang danh sách #{current_page}: {list_url}")

        res = safe_request(session, list_url, max_retries=3, referer=last_referer)
        if not res or res.status_code != 200:
            logger.warning(f"Không thể tải trang #{current_page} (Status: {res.status_code if res else 'None'}). Kết thúc crawl.")
            break

        last_referer = list_url

        # Bóc tách danh sách link bài viết từ div.job__list-item
        job_urls = get_job_links_from_page(res.text, base_url=BASE_DOMAIN)
        if not job_urls:
            logger.info(f"Không còn job nào ở trang #{current_page} (div.job__list-item rỗng). Đã duyệt hết toàn bộ danh sách tin!")
            break

        logger.info(f"Tìm thấy {len(job_urls)} bài tuyển dụng tại trang #{current_page}.")
        cards_metadata = get_job_cards_metadata(res.text, base_url=BASE_DOMAIN)

        if limit_jobs_per_page is not None and limit_jobs_per_page > 0:
            job_urls = job_urls[:limit_jobs_per_page]

        for idx, job_url in enumerate(job_urls, start=1):
            if job_url in visited_urls:
                continue
            visited_urls.add(job_url)

            job_counter += 1
            # Batch Cooldown: Cứ sau mỗi batch_cooldown_every bài, tạm dừng xả hơi
            if job_counter > 1 and job_counter % batch_cooldown_every == 0:
                cooldown_jitter = batch_cooldown_seconds + random.uniform(0.5, 2.0)
                logger.info(
                    f"☕ [Batch Cooldown] Đã duyệt {job_counter} jobs. "
                    f"Tạm nghỉ {cooldown_jitter:.1f}s để mô phỏng người dùng & làm mới rate-limit window..."
                )
                time.sleep(cooldown_jitter)
            else:
                # Delay ngẫu nhiên giữa các request
                delay = random.uniform(min_delay, max_delay)
                time.sleep(delay)

            logger.info(f"  [{idx}/{len(job_urls)}] Cào chi tiết: {job_url}")
            detail_res = safe_request(session, job_url, referer=list_url)

            if not detail_res or detail_res.status_code != 200:
                logger.warning(f"  ❌ Bỏ qua job do không tải được: {job_url}")
                continue

            try:
                job_data = parse_job_detail(detail_res.text, job_url)
                if not job_data:
                    continue

                # Bổ sung thông tin từ card danh sách nếu trên trang chi tiết bị khuyết
                meta = cards_metadata.get(job_url, {})
                if not job_data.get("job_id") and meta.get("job_id"):
                    job_data["job_id"] = meta.get("job_id")

                if not job_data.get("company_name") and meta.get("company_name_list"):
                    job_data["company_name"] = meta.get("company_name_list")

                if not job_data.get("job_title") and meta.get("job_title_list"):
                    job_data["job_title"] = meta.get("job_title_list")

                all_jobs.append(job_data)
                title_disp = (job_data.get("job_title") or "")[:35]
                comp_disp = (job_data.get("company_name") or "N/A")[:25]
                kw_disp = (job_data.get("keyword") or "N/A")[:30]
                logger.info(
                    f"  ✅ [Thành công] {title_disp} | Công ty: {comp_disp} | "
                    f"Keyword: {kw_disp} | Lương: {job_data['salary']}"
                )
            except Exception as e:
                logger.error(f"  ❌ Lỗi khi bóc tách {job_url}: {e}")

        # Tự động lưu lũy tiến dữ liệu sau mỗi trang hoàn tất
        save_data(all_jobs)
        current_page += 1

    logger.info(f"\n🎉 Hoàn thành crawl 123job.vn! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ.")
    return all_jobs


if __name__ == "__main__":
    # TÙY CHỌN CẤU HÌNH KHI CHẠY:
    # - page: 
    #     + Mặc định: 10 trang theo yêu cầu.
    #     + Nếu đặt "max": cào liên tục tất cả các trang cho tới khi hết tin tuyển dụng thì thôi.
    #     + Nếu đặt số (ví dụ: page=10): chỉ cào từ trang 1 đến trang số 10.
    # - max_jobs_per_page: 
    #     + Mặc định: "max" (cào TOÀN BỘ jobs trên mỗi trang).
    #     + Nếu đặt số (ví dụ: 3): chỉ cào 3 bài đầu tiên trên mỗi trang để test nhanh.
    # - min_delay, max_delay: Thời gian nghỉ ngẫu nhiên giữa các job (chống chặn IP)

    # Đọc tham số từ dòng lệnh nếu có (ví dụ: python job123.py --page 5 --max-jobs-per-page 3)
    target_page = 10
    target_jobs_per_page = "max"

    if len(sys.argv) > 1:
        import argparse
        parser = argparse.ArgumentParser(description="123job.vn Job Crawler")
        parser.add_argument("--page", "--pages", default=str(target_page), help="Số trang muốn cào (số hoặc 'max')")
        parser.add_argument("--max-jobs-per-page", "--jobs-per-page", default=str(target_jobs_per_page), help="Số job mỗi trang (số hoặc 'max')")
        args, _ = parser.parse_known_args()
        target_page = int(args.page) if str(args.page).isdigit() else args.page
        target_jobs_per_page = int(args.max_jobs_per_page) if str(args.max_jobs_per_page).isdigit() else args.max_jobs_per_page

    results = crawl(
        page=target_page,                      # Mặc định lấy 10 trang theo yêu cầu (đổi sang 'max' để cào toàn bộ)
        max_jobs_per_page=target_jobs_per_page,# Mặc định cào toàn bộ job trên mỗi trang (đổi sang 3 để test nhanh)
        min_delay=1.2,
        max_delay=2.5,
    )
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs từ 123job.vn.")
