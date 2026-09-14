"""
Crawler for Timviec365 (https://timviec365.vn)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa theo cấu trúc DOM thực tế của Timviec365.vn.

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

SOURCE_NAME = "timviec365"
BASE_DOMAIN = "https://timviec365.vn"
# URL phân trang ngành IT phần mềm
BASE_PAGINATION_URL = "https://timviec365.vn/viec-lam-it-phan-mem-c13v0?page={page}"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "timviec365.csv"
OUTPUT_JSON = OUTPUT_DIR / "timviec365.json"

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
    """Chuẩn hóa URL bài đăng thành link tuyệt đối, loại bỏ các tham số tracking query params."""
    if not raw_url:
        return ""
    full_url = urljoin(base_url, raw_url.strip())
    parts = urlsplit(full_url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


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
    Quét qua danh sách thẻ `a.title_new.titleBlue` từ khối `div.content_vi_v1` (Ảnh 1).
    Lấy thuộc tính `href`, chuẩn hóa thành link tuyệt đối. Trả về `List[str]`.
    """
    soup = BeautifulSoup(html, "html.parser")
    job_links = soup.select("a.title_new.titleBlue, a.title_new, h2.box_title_new a")
    job_urls: List[str] = []
    seen = set()

    for a_elem in job_links:
        raw_href = a_elem.get("href")
        if not raw_href:
            continue

        clean_url = clean_job_url(raw_href, base_url=base_url)
        # Chỉ lấy các link bài tuyển dụng (chứa đuôi -p...html hoặc /viec-lam/)
        if clean_url and clean_url not in seen and ("-p" in clean_url or "html" in clean_url):
            seen.add(clean_url)
            job_urls.append(clean_url)

    return job_urls


def get_job_cards_metadata(html: str, base_url: str = BASE_DOMAIN) -> Dict[str, Dict[str, str]]:
    """
    Trích xuất metadata bổ trợ từ các card ở trang danh sách (Ảnh 1):
    - job_url: Link chi tiết
    - job_title_list: Text hoặc thuộc tính title của thẻ a.title_new.titleBlue
    - company_name_list: Text hoặc thuộc tính title của a.name_com
    - job_id: Trích xuất từ -p{id}.html
    """
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.content_vi_v1, div.item_cate, div.box_right_v1")
    metadata_map: Dict[str, Dict[str, str]] = {}

    for card in cards:
        try:
            a_title = card.select_one("a.title_new.titleBlue, a.title_new, h2.box_title_new a")
            if not a_title or not a_title.get("href"):
                continue

            clean_url = clean_job_url(a_title.get("href"), base_url=base_url)
            title_text = a_title.get("title") or safe_text(a_title)

            comp_elem = card.select_one("a.name_com, .name_com")
            comp_name = ""
            if comp_elem:
                comp_name = comp_elem.get("title") or safe_text(comp_elem)

            # Trích xuất job_id từ URL
            job_id = ""
            id_match = re.search(r"-p(\d+)\.html", clean_url)
            if id_match:
                job_id = id_match.group(1)

            metadata_map[clean_url] = {
                "job_id": job_id,
                "job_title_list": title_text,
                "company_name_list": comp_name,
            }
        except Exception:
            continue

    return metadata_map


def parse_job_detail(detail_html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách an toàn và ánh xạ về Dictionary theo schema chuẩn:
    - Tiêu đề công việc: Text trong thẻ h1.title_new (Ảnh 2)
    - 4 Thông số cơ bản (div.itemDetailInfo_center - Ảnh 2 & 3):
        + salary: Giá trị của khối "Mức lương"
        + location_short: Giá trị của khối "Địa điểm"
        + deadline: Giá trị của khối "Hạn nộp" (chỉ lấy chuỗi DD/MM/YYYY)
        + experience: Giá trị của khối "Kinh nghiệm"
    - Khối Nhà tuyển dụng (div.boxInfoNTD_top - Ảnh 3):
        + company_name: Text thẻ a.linkNtd hoặc a.title (ưu tiên href khớp)
        + company_url: Thuộc tính href của a.boxAvtNtd hoặc a.linkNtd
        + company_logo: Thuộc tính data-src hoặc src của a.boxAvtNtd img
    - Nội dung chi tiết (Ảnh 4 & 5):
        + job_description: Gom text .valInfoSpecific của khối "Mô tả công việc"
        + benefits: Gom text .valInfoSpecific của khối "Quyền lợi"
        + job_requirements: Gom text .valInfoSpecific của khối "Yêu cầu"
    - Ngành nghề & Địa chỉ cụ thể (Ảnh 6):
        + keyword: Gom text thẻ a.linkCateTag thuộc khối "Ngành nghề", lưu dạng {kw_1} {kw_2} ...
        + workplace_detail: Gom text .valDetailCity và .valDetailAddr
    - Thuộc tính mở rộng từ itemYauCauKhac:
        + level (Chức vụ), education (Bằng cấp), recruitment_num (Số lượng tuyển),
          work_type (Hình thức làm việc), posted_date (Ngày cập nhật)
    """
    soup = BeautifulSoup(detail_html, "html.parser")

    # 1. Tiêu đề công việc (Ảnh 2)
    h1_elem = soup.select_one("div.boxtitlenew h1.title_new, h1.title_new, h1")
    job_title = safe_text(h1_elem)

    # Kiểm tra bài đăng đã đóng hoặc trang không tồn tại
    if not job_title or "không tồn tại" in job_title.lower() or "404" in job_title.lower():
        logger.warning(f"Bài tuyển dụng đã đóng hoặc trang không tồn tại: {job_url}")
        return {}

    # Trích xuất job_id từ URL hoặc data-id
    job_id = ""
    id_match = re.search(r"-p(\d+)\.html", job_url)
    if id_match:
        job_id = id_match.group(1)
    else:
        p_id = soup.select_one("p.titleNew[data-id], [data-id]")
        if p_id and p_id.get("data-id"):
            job_id = p_id.get("data-id")

    # 2. Bốn thuộc tính cơ bản dạng box (Ảnh 2 & 3: div.boxdetailinfo)
    salary = ""
    location_short = ""
    deadline = ""
    experience = ""

    for item in soup.select("div.boxdetailinfo .itemDetailInfo_center, .itemDetailInfo_center"):
        label_el = item.select_one(".titleContentSalary")
        val_el = item.select_one(".valContentSalary")
        if not label_el or not val_el:
            continue

        label = safe_text(label_el).lower()
        val = safe_text(val_el)

        if "lương" in label:
            salary = val
        elif "địa điểm" in label:
            location_short = val
        elif "hạn nộp" in label:
            # Chỉ lấy chuỗi ngày DD/MM/YYYY, bỏ phần text như (20 ngày)
            m = re.search(r"\d{2}/\d{2}/\d{4}", val)
            deadline = m.group(0) if m else val.split("(")[0].strip()
        elif "kinh nghiệm" in label:
            experience = val

    # 3. Khối Nhà tuyển dụng (Ảnh 3)
    company_name = ""
    company_url = ""
    company_logo = ""

    # Tìm tên công ty từ link tuyển dụng chính xác (ưu tiên a.linkNtd và h2/a trong boxInfoNTD)
    comp_link = soup.select_one(
        "a.linkNtd, "
        "div.boxInfoNTD_top a.title, "
        "div.boxInfoNTD_top h2.title, "
        "div.boxInfoNTD_top h2 a, "
        "div.boxInfoNTD_top a[href*='-co']:not(.boxAvtNtd):not(.linkNtd_bot)"
    )
    if comp_link:
        company_name = safe_text(comp_link)
        if comp_link.get("href"):
            company_url = urljoin(BASE_DOMAIN, comp_link.get("href").strip())

    # Fallback link công ty từ a.boxAvtNtd nếu company_url còn trống
    if not company_url:
        box_avt = soup.select_one("a.boxAvtNtd")
        if box_avt and box_avt.get("href"):
            company_url = urljoin(BASE_DOMAIN, box_avt.get("href").strip())

    # Logo công ty
    logo_img = soup.select_one("a.boxAvtNtd img, img.avtNtd, .boxInfoNTD_top img")
    if logo_img:
        raw_logo = logo_img.get("data-src") or logo_img.get("src") or ""
        if raw_logo and "user_chat_off" not in raw_logo and "load.gif" not in raw_logo:
            company_logo = urljoin(BASE_DOMAIN, raw_logo.strip())
        if (not company_name or len(company_name) < 4 or "ngày" in company_name.lower()) and logo_img.get("alt"):
            company_name = logo_img.get("alt").strip()

    # 4. Nội dung chi tiết: Mô tả, Quyền lợi, Yêu cầu (Ảnh 4 & 5)
    job_description = ""
    benefits = ""
    job_requirements = ""

    for item in soup.select("div.boxContentInfoSpecific .itemInfoSpecific, .itemInfoSpecific"):
        h_el = item.select_one(".titleInfoSpecific, .title_InfoSpecific, h2, p")
        val_el = item.select_one(".valInfoSpecific")
        if not h_el or not val_el:
            continue

        h_txt = safe_text(h_el).lower()
        content = safe_text(val_el, sep="\n")

        if "mô tả" in h_txt:
            job_description = content
        elif "quyền lợi" in h_txt or "chế độ" in h_txt:
            benefits = content
        elif "yêu cầu" in h_txt:
            job_requirements = content

    # 5. Khối Ngành nghề / Keywords (Ảnh 6)
    keywords: List[str] = []
    for item in soup.select("div.itemInfoSpecific"):
        h_el = item.select_one(".titleInfoSpecific, h2, p")
        if h_el and "ngành nghề" in safe_text(h_el).lower():
            for a in item.select("a.linkCateTag, a"):
                txt = safe_text(a).replace(",", "").strip()
                if txt and txt not in keywords:
                    keywords.append(txt)
            break

    # Fallback tìm toàn bộ thẻ tag
    if not keywords:
        for a in soup.select("a.linkCateTag"):
            txt = safe_text(a).replace(",", "").strip()
            if txt and txt not in keywords:
                keywords.append(txt)

    keyword_str = " ".join([f"{{{k}}}" for k in keywords])

    # 6. Khối Địa điểm làm việc chi tiết (Ảnh 6)
    workplace_detail = ""
    for item in soup.select("div.itemInfoSpecific"):
        h_el = item.select_one(".titleInfoSpecific, h2, p")
        if h_el and "địa điểm làm việc" in safe_text(h_el).lower():
            city = safe_text(item.select_one(".valDetailCity, .valDetailCity span"))
            addr = safe_text(item.select_one(".valDetailAddr"))
            if city and addr:
                workplace_detail = f"{addr}, {city}".strip(", ").strip()
            else:
                workplace_detail = addr or city
            break

    # 7. Các thuộc tính bổ sung từ .itemYauCauKhac
    level = ""
    education = ""
    recruitment_num = ""
    work_type = ""
    posted_date = ""

    for item in soup.select(".itemYauCauKhac"):
        title_yc = safe_text(item.select_one(".titleYauCauKhac")).lower()
        val_yc = safe_text(item.select_one(".valYauCauKhac"))

        if "chức vụ" in title_yc or "cấp bậc" in title_yc:
            level = val_yc
        elif "bằng cấp" in title_yc or "trình độ" in title_yc:
            education = val_yc
        elif "số lượng" in title_yc:
            recruitment_num = val_yc
        elif "hình thức" in title_yc:
            work_type = val_yc
        elif "cập nhật" in title_yc or "ngày đăng" in title_yc:
            m = re.search(r"\d{2}/\d{2}/\d{4}", val_yc)
            posted_date = m.group(0) if m else val_yc.split("(")[0].strip()

    location = workplace_detail if workplace_detail else location_short

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
        "workplace_detail": workplace_detail,
        "experience": experience,
        "education": education,
        "work_type": work_type,
        "level": level,
        "deadline": deadline,
        "posted_date": posted_date,
        "recruitment_num": recruitment_num,
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
    Tiến trình cào dữ liệu Timviec365 hoàn chỉnh:
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

    logger.info(f"🚀 Bắt đầu crawl Timviec365: {BASE_PAGINATION_URL.format(page=1)}")
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

        # Bóc tách danh sách link bài viết từ div.content_vi_v1
        job_urls = get_job_links_from_page(res.text, base_url=BASE_DOMAIN)
        if not job_urls:
            logger.info(f"Không còn job nào ở trang #{current_page}. Đã duyệt hết toàn bộ danh sách tin!")
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

    logger.info(f"\n🎉 Hoàn thành crawl Timviec365! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ.")
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

    # Đọc tham số từ dòng lệnh nếu có (ví dụ: python 365timviec.py --page 5 --max-jobs-per-page 3)
    target_page = 10
    target_jobs_per_page = "max"

    if len(sys.argv) > 1:
        import argparse
        parser = argparse.ArgumentParser(description="Timviec365 Job Crawler")
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
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs từ Timviec365.")
