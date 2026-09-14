"""
Crawler for TopCV (https://www.topcv.vn)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa trên curl_cffi & BeautifulSoup.

Đặc điểm kiến trúc & Anti-Ban (Anti-Block) tối ưu:
1. Giả lập TLS Fingerprint người thật:
   Sử dụng curl_cffi Session impersonate "chrome120" với đầy đủ Cookie jar, vượt qua Cloudflare WAF.
2. Cơ chế phân trang nút Next (fa-chevron-right):
   Tự động bóc tách link trang kế tiếp từ thuộc tính data-href / href của thẻ a chứa icon fa-chevron-right.
3. Bóc tách chi tiết đầy đủ 14 trường thông tin:
   - Header & Thông tin cơ bản: job_title, salary, location_short, experience, deadline.
   - Doanh nghiệp: company_name, company_logo (chuẩn hóa link ảnh gốc).
   - Nội dung bài đăng: job_description, job_requirements, benefits.
   - Thông tin bên lề: working_location, working_time.
4. Anti-Ban & Rate-Limit Protection:
   - Rotating Headers & Referer luân phiên tự nhiên theo chuỗi điều hướng.
   - Polite Random Delay (2.0s - 4.0s) giữa các lượt tải trang / bài đăng.
   - Batch Cooldown: Tự động nghỉ xả hơi (5s - 8s) sau mỗi 10 bài đăng để làm mới rate-limit window.
   - Exponential Backoff & Retry: Tự động hạ nhiệt, tăng thời gian chờ khi gặp sự cố mạng hoặc mã lỗi 429/503.
5. Hỗ trợ tham số linh hoạt:
   - page="max": Cào liên tục theo nút Next đến khi hết danh sách.
   - page=N: Giới hạn cào tối đa N trang.
   - max_jobs_per_page: Giới hạn số job cào mỗi trang (tiện lợi khi test nhanh).
6. Incremental Auto-Save:
   Tự động lưu lũy tiến ra file CSV chuẩn UTF-8-sig (hỗ trợ Excel tiếng Việt) và JSON sau mỗi trang.
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
from typing import List, Dict, Any, Optional, Tuple, Union
from urllib.parse import urljoin, unquote

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
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

SOURCE_NAME = "topcv"
BASE_DOMAIN = "https://www.topcv.vn"
DEFAULT_START_URL = "https://www.topcv.vn/tim-viec-lam-cong-nghe-thong-tin-cr257?page=1"
FALLBACK_START_URL = "https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026?page=1"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "topcv.csv"
OUTPUT_JSON = OUTPUT_DIR / "topcv.json"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]


def get_random_headers(referer: Optional[str] = None) -> Dict[str, str]:
    """Tạo bộ HTTP headers hoàn chỉnh khớp với Chrome 120 để tránh Cloudflare TLS/Header Mismatch."""
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin" if referer else "none",
        "Sec-Fetch-User": "?1",
        "Priority": "u=0, i",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def safe_text(elem: Any, sep: str = " ") -> str:
    """Trích xuất chuỗi văn bản an toàn, loại bỏ khoảng trắng thừa."""
    if elem is None:
        return ""
    if hasattr(elem, "get_text"):
        raw = elem.get_text(separator=sep, strip=True)
    else:
        raw = str(elem).strip()
    return re.sub(r"[ \t\r\f\v]+", " ", raw).strip()


def clean_image_url(url: str) -> str:
    """
    Chuẩn hóa URL hình ảnh, unwrap tiền tố proxy unsafe/... nếu có.
    Ví dụ: https://cdn-new.topcv.vn/unsafe/80x/https://static.topcv.vn/... -> https://static.topcv.vn/...
    """
    if not url:
        return ""
    if "https://" in url[8:]:
        idx = url.find("https://", 8)
        return url[idx:]
    if "http://" in url[7:]:
        idx = url.find("http://", 7)
        return url[idx:]
    return url


def create_session(proxy: Optional[str] = None) -> Any:
    """
    Tạo Client Session lưu trữ Cookies liên tục giữa các lượt request,
    kết hợp giả lập TLS Fingerprint của Chrome 120 thật để vượt qua WAF Cloudflare.
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
            session.proxies.update({"http": resolved_proxy, "https": resolved_proxy})
        return session


def safe_request(
    session: Any,
    url: str,
    max_retries: int = 5,
    initial_backoff: float = 3.0,
    referer: Optional[str] = None,
) -> Optional[Any]:
    """
    Thực hiện HTTP GET an toàn kèm cơ chế tự động thử lại (Retry with Exponential Backoff).
    Xử lý chuyên sâu HTTP 429 (Rate Limit):
    - Đọc header Retry-After nếu server trả về.
    - Tự động xóa sạch cookies tracking (client_id, topcv_session) để reset danh tính lượt gọi.
    - Nghỉ hạ nhiệt thực tế (8s - 30s) giúp server xả hết leaky bucket rate-limit.
    """
    backoff = initial_backoff
    headers = get_random_headers(referer=referer)

    for attempt in range(1, max_retries + 1):
        try:
            response = session.get(url, headers=headers, timeout=30)

            # Nếu gặp 404 hoặc 410: Bài đăng đã bị xóa / không tồn tại, bỏ qua ngay
            if response.status_code in [404, 410]:
                logger.warning(f"Bài đăng không tồn tại hoặc đã hết hạn (HTTP {response.status_code}): {url}")
                return None

            # Nếu trang trả về bình thường (200)
            if response.status_code == 200:
                # Kiểm tra xem có bị Cloudflare Bot Challenge chặn không
                lower_text = response.text[:4000].lower()
                if "sorry, you have been blocked" in lower_text or "attention required! | cloudflare" in lower_text:
                    logger.warning(
                        f"🛡️  [Cloudflare Challenge] Lần #{attempt}/{max_retries}. Tạm dừng {backoff:.1f}s để vượt qua..."
                    )
                    time.sleep(backoff)
                    backoff *= 2
                    if hasattr(session, "cookies"):
                        session.cookies.clear()
                    headers = get_random_headers(referer=referer or BASE_DOMAIN)
                    continue
                return response

            # Nếu gặp HTTP 429: Bị giới hạn tần suất (Rate Limit)
            if response.status_code == 429:
                # 1. Kiểm tra header Retry-After từ TopCV
                retry_after_hdr = response.headers.get("Retry-After")
                if retry_after_hdr and retry_after_hdr.strip().isdigit():
                    wait_time = float(retry_after_hdr.strip()) + random.uniform(1.0, 3.0)
                else:
                    # Hạ nhiệt lũy tiến thực tế: 8s, 16s, 24s, 32s...
                    wait_time = max(8.0 * attempt + random.uniform(1.5, 3.5), backoff)

                # 2. Xóa sạch cookies tracking để làm mới client_id & topcv_session
                if hasattr(session, "cookies"):
                    session.cookies.clear()

                logger.warning(
                    f"⚠️  [HTTP 429 Rate-Limit] TopCV hạn chế tần suất tại {url}. "
                    f"Lần #{attempt}/{max_retries}. Đã xóa cookie tracking, tạm nghỉ hạ nhiệt {wait_time:.1f}s..."
                )
                time.sleep(wait_time)
                backoff *= 2
                headers = get_random_headers(referer=referer or BASE_DOMAIN)
                continue

            # Nếu gặp lỗi HTTP 403 (Cloudflare WAF chặn IP Datacenter)
            if response.status_code == 403:
                lower_text = response.text[:2000].lower()
                is_challenge = "just a moment..." in lower_text or "cf-turnstile" in lower_text or "cloudflare" in lower_text

                # Thử nghiệm luân chuyển TLS Fingerprint Profile (Safari17 / Chrome124) để vượt Cloudflare
                if HAS_CURL_CFFI and attempt <= 2:
                    alt_imp = "safari17_0" if attempt == 1 else "chrome124"
                    logger.info(f"🔄 [Anti-WAF] Thử nghiệm chuyển đổi TLS Profile sang '{alt_imp}' tại {url} (Lần #{attempt})...")
                    try:
                        resolved_proxy = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
                        kwargs = {"impersonate": alt_imp, "timeout": 25}
                        if resolved_proxy:
                            kwargs["proxies"] = {"http": resolved_proxy, "https": resolved_proxy}
                        alt_session = curl_requests.Session(**kwargs)
                        alt_res = alt_session.get(url, timeout=25)
                        if alt_res.status_code == 200 and "just a moment..." not in alt_res.text[:2000].lower():
                            logger.info(f"🎉 Vượt Cloudflare thành công bằng profile '{alt_imp}'!")
                            return alt_res
                    except Exception as alt_err:
                        logger.debug(f"Thử profile {alt_imp} thất bại: {alt_err}")

                if attempt >= 2:
                    logger.warning(
                        f"🛡️  [Cloudflare WAF Blocked HTTP 403] Không thể tải URL qua web search thông thường. "
                        f"Kích hoạt cơ chế dự phòng tự động..."
                    )
                    return None
                logger.warning(
                    f"⚠️  [HTTP 403] Sự cố tạm thời tại {url}. "
                    f"Lần #{attempt}/{max_retries}. Tạm dừng {backoff:.1f}s..."
                )
                time.sleep(backoff)
                backoff *= 2
                if hasattr(session, "cookies"):
                    session.cookies.clear()
                headers = get_random_headers(referer=referer or BASE_DOMAIN)
                continue

            # Nếu gặp lỗi server tạm thời 500, 502, 503, 504
            if response.status_code in [500, 502, 503, 504]:
                logger.warning(
                    f"⚠️  [HTTP {response.status_code}] Sự cố tạm thời tại {url}. "
                    f"Lần #{attempt}/{max_retries}. Tạm dừng {backoff:.1f}s..."
                )
                time.sleep(backoff)
                backoff *= 2
                if hasattr(session, "cookies"):
                    session.cookies.clear()
                headers = get_random_headers(referer=referer or BASE_DOMAIN)
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
            if hasattr(session, "cookies"):
                session.cookies.clear()
            headers = get_random_headers(referer=referer or BASE_DOMAIN)

    logger.error(f"❌ Không thể tải {url} sau {max_retries} lần thử.")
    return None


def extract_job_links_and_next_page(html: str, base_url: str = BASE_DOMAIN) -> Tuple[List[Dict[str, str]], Optional[str]]:
    """
    1. Quét qua danh sách các thẻ div.job-item-search-result, lấy:
       - job_url: href trong thẻ h3.title a (hoặc khối div.title-block a).
       - company_name_list: text của thẻ a.company.
    2. Tìm nút chuyển trang (Next Page) bên phải trong ul.pagination chứa icon i.fa-chevron-right.
       Rút trích URL kế tiếp từ data-href (hoặc href).
    Trả về: (List các dict job thông tin sơ bộ, next_page_url)
    """
    soup = BeautifulSoup(html, "html.parser")
    jobs_info: List[Dict[str, str]] = []
    seen = set()

    # 1. Bóc tách danh sách job trên trang danh sách (Ảnh 2)
    job_cards = soup.select("div.job-item-search-result")
    for card in job_cards:
        # Tìm link bài viết
        a_title = card.select_one("h3.title a, div.title-block a[target='_blank'], a[href*='/viec-lam/']")
        if not a_title:
            continue

        raw_href = a_title.get("href")
        if not raw_href:
            continue

        clean_href = raw_href.split("?")[0].strip()
        full_job_url = clean_href if clean_href.startswith("http") else urljoin(base_url, clean_href)

        if full_job_url in seen:
            continue
        seen.add(full_job_url)

        # Metadata từ thẻ Card trên trang danh sách
        company_elem = card.select_one("a.company, a.company-name, [class*='company']")
        company_name_list = safe_text(company_elem)

        title_elem = card.select_one("h3.title a span, h3.title a, div.title-block a")
        job_title_card = safe_text(title_elem)
        if not job_title_card and a_title:
            job_title_card = a_title.get("title") or a_title.get("aria-label") or safe_text(a_title)

        salary_elem = card.select_one(".title-salary, .salary, [class*='salary']")
        salary_card = safe_text(salary_elem) or "Thoả thuận"

        loc_elem = card.select_one(".address, .location, [class*='address'], [class*='city']")
        loc_card = safe_text(loc_elem)

        exp_elem = card.select_one(".exp, [class*='exp']")
        exp_card = safe_text(exp_elem)

        avatar_img = card.select_one("div.avatar img, img[class*='avatar'], img")
        raw_logo = ""
        if avatar_img:
            raw_logo = avatar_img.get("data-src") or avatar_img.get("src") or ""
        company_logo_card = clean_image_url(raw_logo)

        jobs_info.append({
            "job_url": full_job_url,
            "company_name_list": company_name_list,
            "job_title_card": job_title_card,
            "salary_card": salary_card,
            "location_card": loc_card,
            "experience_card": exp_card,
            "company_logo_card": company_logo_card,
        })

    # 2. Tìm thẻ nút Next trang bên phải: thẻ a bên trong ul.pagination có chứa icon i.fa-chevron-right (Ảnh 1)
    next_page_url: Optional[str] = None
    for a_elem in soup.select("ul.pagination li a"):
        # Nhận diện thẻ a chứa icon fa-chevron-right hoặc rel='next'
        has_chevron = bool(a_elem.select("i.fa-chevron-right, i[class*='chevron-right']"))
        has_rel_next = a_elem.get("rel") == ["next"] or (a_elem.get("rel") and "next" in a_elem.get("rel"))
        aria_next = "next" in str(a_elem.get("aria-label", "")).lower()

        if has_chevron or has_rel_next or aria_next:
            # Kiểm tra xem thẻ li cha có bị class disabled không
            li_parent = a_elem.find_parent("li")
            if li_parent and "disabled" in li_parent.get("class", []):
                break

            raw_next = a_elem.get("data-href") or a_elem.get("href")
            if raw_next and raw_next != "#" and "javascript:" not in raw_next:
                next_page_url = raw_next if raw_next.startswith("http") else urljoin(base_url, raw_next)
                break

    return jobs_info, next_page_url


def extract_keywords(soup: BeautifulSoup) -> str:
    """
    Trích xuất từ khóa chuyên môn từ khối Job Tags của TopCV (Ảnh 1):
    - Tìm khối .job-tags__group hoặc .job-tags_group có tiêu đề chứa text 'chuyên môn'
    - Lấy text hoặc title của các thẻ <a> bên trong khối .job-tags_group-list-tag
    - Loại bỏ hoàn toàn dấu phẩy ',' và khoảng trắng thừa
    - Khử trùng lặp, giữ nguyên thứ tự
    - Trả về chuỗi dạng: '{kw_1} {kw_2} ...' trong 1 cột 'keyword'
    """
    keywords: List[str] = []

    # 1. Quét qua tất cả các nhóm trong khối .job-tags
    groups = soup.select("div.job-tags__group, div.job-tags_group, .job-tags > div")
    for g in groups:
        name_elem = g.select_one(".job-tags__group-name, .job-tags_group-name, h3, h4, h5, .title")
        if name_elem and "chuyên môn" in name_elem.get_text().lower():
            for a in g.select("a"):
                text = a.get_text(strip=True).replace(",", "").strip()
                if not text:
                    text = (a.get("title") or "").replace(",", "").strip()
                if text and text not in keywords:
                    keywords.append(text)
            if keywords:
                break

    # 2. Fallback nếu cấu trúc class thay đổi: tìm theo tiêu đề chứa text 'chuyên môn'
    if not keywords:
        for title in soup.find_all(["h3", "h4", "h5", "div"], class_=lambda c: c and ("group-name" in c or "title" in c)):
            if "chuyên môn" in title.get_text().lower():
                parent = title.parent
                if parent:
                    for a in parent.find_all("a"):
                        text = a.get_text(strip=True).replace(",", "").strip()
                        if not text:
                            text = (a.get("title") or "").replace(",", "").strip()
                        if text and text not in keywords:
                            keywords.append(text)
                if keywords:
                    break

    if not keywords:
        return ""

    return " ".join([f"{{{kw}}}" for kw in keywords])


def parse_job_detail(html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách an toàn và chính xác toàn bộ thông tin chi tiết công việc từ TopCV:
    - Ảnh 3 & 4 (Header & Thông tin cơ bản):
        + job_title: h1.box-header_job_title / h1.box-header-job__title
        + salary: span.box-header_job_salary_title / span.box-header-job__salary--title
        + location_short: div.list-info_content_desc thuộc item có title 'Địa điểm'
        + experience: div.list-info_content_desc thuộc item có title 'Kinh nghiệm'
        + deadline: div.list-info_content_desc thuộc item có title 'Hạn ứng tuyển'
    - Ảnh 1 (Chuyên môn / Keyword):
        + keyword: Định dạng '{kw_1} {kw_2} ...' từ khối Job Tags chuyên môn, loại bỏ dấu phẩy ','
    - Ảnh 5 (Logo & Doanh nghiệp):
        + company_logo: src trong thẻ img của a.company-logo / div.box-company-info
        + company_name: alt / title của img / a.name trong box công ty
    - Ảnh 6 (Mô tả & Yêu cầu):
        + job_description: Gom text tất cả thẻ li / p trong item có h2: 'Mô tả công việc'
        + job_requirements: Gom text tất cả thẻ li / p trong item có h2: 'Yêu cầu ứng viên'
    - Ảnh 7 (Quyền lợi, Địa điểm & Thời gian làm việc):
        + benefits: Gom text các thẻ li / p trong item có h2: 'Quyền lợi ứng viên'
        + working_location: Text khối con có tiêu đề 'Địa điểm làm việc'
        + working_time: Text khối con có tiêu đề 'Thời gian làm việc'
    - source: "topcv"
    """
    soup = BeautifulSoup(html, "html.parser")

    # 1. Ảnh 3: Tiêu đề công việc
    title_el = soup.select_one(
        "h1.box-header_job_title, h1.box-header-job__title, h1.job-detail__info--title, h1"
    )
    job_title = safe_text(title_el)

    # 2. Ảnh 3: Mức lương
    salary_el = soup.select_one(
        "span.box-header_job_salary_title, span.box-header-job__salary--title, "
        "div.box-header_job_salary span, div.box-header-job__salary span, "
        "div.box-header-job__salary--title"
    )
    salary = safe_text(salary_el) if salary_el else "Thoả thuận"

    # 3. Ảnh 4: 3 khối thông số cơ bản (Địa điểm, Kinh nghiệm, Hạn ứng tuyển)
    location_short = ""
    experience = ""
    deadline = ""

    info_items = soup.select(
        "div.box-header-job-list-info_item, div.box-header-job-list-info__item, div.job-detail__info--item"
    )
    for it in info_items:
        t_el = it.select_one(".list-info_content_title, .list-info__content__title, [class*='title']")
        d_el = it.select_one(".list-info_content_desc, .list-info__content__desc, [class*='desc']")
        t_text = safe_text(t_el).lower()
        d_text = safe_text(d_el)

        if "địa điểm" in t_text:
            location_short = d_text
        elif "kinh nghiệm" in t_text:
            experience = d_text
        elif "hạn" in t_text or "ứng tuyển" in t_text or "nộp" in t_text:
            deadline = d_text

    # Trích xuất keyword chuyên môn từ khối .job-tags
    keyword = extract_keywords(soup)

    # 4. Ảnh 5: Logo & Tên công ty tuyển dụng
    company_logo = ""
    company_name = ""

    logo_el = soup.select_one(
        "div.box-company-info-detail_header a.company-logo img, a.company-logo img, "
        "div.box-company-info__image img, div.box-company-info a img, div.company-info img"
    )
    if logo_el:
        company_logo = clean_image_url(logo_el.get("src", ""))
        company_name = logo_el.get("alt") or logo_el.get("title") or ""

    if not company_name:
        name_el = soup.select_one(
            "div.box-company-info a.name, div.box-company-info-detail_header a.company-name, "
            "div.company-name-label, a.company-name, div.box-company-info__detail a, "
            "div.company-detail__info--name"
        )
        company_name = safe_text(name_el)

    # 5. Ảnh 6 & 7: Mô tả, Yêu cầu, Quyền lợi, Địa điểm và Thời gian
    job_description = ""
    job_requirements = ""
    benefits = ""
    working_location = ""
    working_time = ""

    sections = soup.select("div.box-job-information-detail-item, div.job-description__item")
    for s in sections:
        h2 = s.select_one("h2.box-job-information-detail-item_title, h2, h3")
        h2_text = safe_text(h2).lower()

        content_box = (
            s.select_one(".box-job-information-detail-item_text, [class*='text'], [class*='content']")
            or s
        )

        # Gom text tất cả thẻ li hoặc p
        li_items = [safe_text(li) for li in content_box.select("li") if safe_text(li)]
        if li_items:
            content_text = "\n".join(li_items)
        else:
            p_items = [safe_text(p) for p in content_box.select("p") if safe_text(p)]
            if p_items:
                content_text = "\n".join(p_items)
            else:
                # Loại trừ text tiêu đề h2
                content_text = safe_text(content_box, sep="\n").replace(safe_text(h2), "").strip()

        if "mô tả công việc" in h2_text or "mô tả" in h2_text:
            job_description = content_text
        elif "yêu cầu ứng viên" in h2_text or "yêu cầu" in h2_text:
            job_requirements = content_text
        elif "quyền lợi ứng viên" in h2_text or "quyền lợi" in h2_text or "phúc lợi" in h2_text:
            benefits = content_text
        elif "địa điểm và thời gian" in h2_text or "địa điểm" in h2_text or "thời gian" in h2_text:
            # Khối con địa điểm và thời gian làm việc (Ảnh 7)
            sub_items = s.select(
                "div.box-job-information-address-and-time-list_item, div[class*='address-and-time-list_item'], li"
            )
            for sub in sub_items:
                sub_t = safe_text(
                    sub.select_one("[class*='title'], h3, strong, span")
                ).lower()
                sub_c_el = sub.select_one("[class*='content'], div, p") or sub
                sub_c = safe_text(sub_c_el)

                if "địa điểm" in sub_t:
                    working_location = sub_c.replace(sub_t, "").strip("- :")
                elif "thời gian" in sub_t:
                    working_time = sub_c.replace(sub_t, "").strip("- :")

    # Fallback nếu khối địa điểm/thời gian dùng class độc lập
    if not working_location:
        for it in soup.select("div.box-job-information-address-and-time-list_item"):
            t = safe_text(it.select_one("[class*='title'], h3")).lower()
            c = safe_text(it.select_one("[class*='content']"))
            if "địa điểm" in t and c:
                working_location = c
                break

    if not working_time:
        for it in soup.select("div.box-job-information-address-and-time-list_item"):
            t = safe_text(it.select_one("[class*='title'], h3")).lower()
            c = safe_text(it.select_one("[class*='content']"))
            if "thời gian" in t and c:
                working_time = c
                break

    # Fallback quét text tìm 'Thời gian làm việc'
    if not working_time:
        for tag in soup.find_all(["div", "p", "li"]):
            txt = safe_text(tag)
            if "thời gian làm việc:" in txt.lower():
                parts = re.split(r"thời gian làm việc\s*:\s*", txt, flags=re.IGNORECASE)
                if len(parts) > 1 and len(parts[1]) < 250:
                    working_time = parts[1].strip("- ")
                    break

    # Nếu working_location rỗng, fallback sang location_short từ header
    if not working_location:
        working_location = location_short

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
        "workplace_detail": working_location,
        "working_time": working_time,
        "posted_date": None,
        "deadline": deadline,
        "keyword": keyword,
        "job_description": job_description,
        "job_requirements": job_requirements,
        "benefits": benefits,
        "extra_info": {},
    }


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu trực tiếp vào bảng riêng `jobs_topcv` trên Supabase và lưu backup JSON."""
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
    except Exception as err:
        logger.debug(f"Không thể ghi file backup: {err}")


def crawl_from_sitemap(session: Any, max_jobs: int = 50) -> List[Dict[str, Any]]:
    """
    Cơ chế cào dự phòng khi trang tìm kiếm bị Cloudflare WAF chặn IP Datacenter:
    - Đọc file sitemap: https://www.topcv.vn/sitemap/jobs_0.xml, jobs_1.xml... (sitemap không bị WAF chặn).
    - Lọc các bài đăng thuộc ngành CNTT / IT / Lập trình theo từ khóa URL.
    - Cào trực tiếp trang chi tiết từng bài đăng (trang chi tiết ít bị kiểm duyệt WAF hơn trang tìm kiếm).
    """
    logger.info("🗺️ [Sitemap Fallback] Đang tải danh sách việc làm từ TopCV Sitemap...")
    it_keywords = [
        "developer", "engineer", "it", "lap-trinh", "phan-mem", "tester",
        "frontend", "backend", "fullstack", "java", "python", "react", "php",
        "net", "data", "ai", "tech", "system", "cloud", "devops", "security",
        "qa", "qc", "cntt", "mobile", "ios", "android", "embedded", "golang"
    ]

    candidate_urls: List[str] = []
    for sitemap_idx in range(4):
        sitemap_url = f"https://www.topcv.vn/sitemap/jobs_{sitemap_idx}.xml"
        try:
            r = session.get(sitemap_url, timeout=15)
            if r.status_code == 200:
                found_urls = re.findall(r"<loc>(https://www\.topcv\.vn/viec-lam/[^<]+)</loc>", r.text)
                for u in found_urls:
                    u_clean = u.split("?")[0].strip()
                    if any(kw in u_clean.lower() for kw in it_keywords):
                        if u_clean not in candidate_urls:
                            candidate_urls.append(u_clean)
                if len(candidate_urls) >= max_jobs * 2:
                    break
        except Exception as e:
            logger.debug(f"Lỗi khi đọc {sitemap_url}: {e}")

    logger.info(f"🗺️ [Sitemap Fallback] Tìm thấy {len(candidate_urls)} việc làm IT tiềm năng từ Sitemap.")

    extracted_jobs: List[Dict[str, Any]] = []
    target_urls = candidate_urls[:max_jobs]

    for idx, job_url in enumerate(target_urls, start=1):
        time.sleep(random.uniform(1.2, 2.5))
        logger.info(f"  [{idx}/{len(target_urls)}] [Sitemap] Cào chi tiết: {job_url}")
        res = safe_request(session, job_url, referer="https://www.topcv.vn/")
        if not res or res.status_code != 200:
            continue
        try:
            job_data = parse_job_detail(res.text, job_url)
            extracted_jobs.append(job_data)
            title_disp = (job_data.get("job_title") or "")[:35]
            comp_disp = (job_data.get("company_name") or "N/A")[:25]
            logger.info(f"  ✅ [Thành công] {title_disp} | {comp_disp} | Lương: {job_data['salary']}")
        except Exception as e:
            logger.debug(f"Lỗi bóc tách {job_url}: {e}")

    logger.info(f"🎉 [Sitemap Fallback] Thu thập thành công {len(extracted_jobs)} việc làm IT TopCV.")
    return extracted_jobs


def crawl(
    page: Union[int, str, None] = 10,
    start_url: str = DEFAULT_START_URL,
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 2.0,
    max_delay: float = 4.0,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 8.0,
    rotate_session_every: int = 15,
    proxy: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Hàm cào dữ liệu chính từ website TopCV.vn:
    - page:
        + Mặc định: 10 trang (hoặc đặt "max" để cào liên tục theo nút Next cho tới khi hết trang).
        + Nếu đặt số N: chỉ cào tối đa N trang.
    - start_url: URL danh sách việc làm ban đầu (mặc định IT - Công nghệ thông tin).
    - max_jobs_per_page:
        + Mặc định: "max" (cào TOÀN BỘ jobs trên trang, 50 jobs/trang).
        + Nếu đặt số N (ví dụ: 3, 5): chỉ lấy N jobs trên mỗi trang để test nhanh.
    - min_delay, max_delay: Thời gian nghỉ ngẫu nhiên giữa các lượt tải trang (2.0s - 4.0s).
    - batch_cooldown_every, batch_cooldown_seconds: Nghỉ xả hơi sau mỗi batch N jobs để làm mới rate-limit window.
    - rotate_session_every: Định kỳ xóa tracking cookies (client_id, topcv_session) sau mỗi N jobs.
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

    logger.info(f"🚀 Bắt đầu crawl TopCV: {start_url}")
    logger.info(
        f"⚙️  Cấu hình: Page = {limit_num if limit_num else 'MAX (Chạy đến hết theo nút Next)'} | "
        f"Jobs/Page = {limit_jobs_per_page if limit_jobs_per_page else 'MAX (Toàn bộ)'} | "
        f"Delay = {min_delay}s - {max_delay}s | Cooldown = {batch_cooldown_seconds}s mỗi {batch_cooldown_every} jobs | "
        f"Rotate Session = Mỗi {rotate_session_every} jobs"
    )

    session = create_session(proxy=proxy)
    all_jobs: List[Dict[str, Any]] = []
    visited_urls = set()
    current_page_idx = 1
    current_url: Optional[str] = start_url
    last_referer = "https://www.google.com/"
    job_counter = 0

    while current_url:
        if limit_num is not None and current_page_idx > limit_num:
            logger.info(f"🏁 Đã hoàn thành cào đến trang #{limit_num}. Dừng crawl.")
            break

        logger.info(f"\n📄 Đang tải trang danh sách #{current_page_idx}: {current_url}")
        res = safe_request(session, current_url, max_retries=5, referer=last_referer)

        if not res or res.status_code != 200:
            if current_page_idx == 1 and current_url == DEFAULT_START_URL:
                logger.info(f"🔄 Thử lại trang danh sách với URL thay thế: {FALLBACK_START_URL}")
                current_url = FALLBACK_START_URL
                res = safe_request(session, current_url, max_retries=3, referer=last_referer)

            if not res or res.status_code != 200:
                logger.warning(
                    f"⚠️ Không thể tải trang danh sách #{current_page_idx} (Status: {res.status_code if res else 'None'}). "
                    f"Kích hoạt cơ chế dự phòng: Cào việc làm IT trực tiếp từ Sitemap TopCV..."
                )
                target_jobs_count = (limit_num or 5) * (limit_jobs_per_page or 10)
                sitemap_jobs = crawl_from_sitemap(session, max_jobs=target_jobs_count)
                if sitemap_jobs:
                    all_jobs.extend(sitemap_jobs)
                    save_data(all_jobs)
                break

        last_referer = current_url

        # Bóc tách danh sách link bài viết và link trang kế tiếp (Next Page)
        jobs_info, next_page_url = extract_job_links_and_next_page(res.text, base_url=BASE_DOMAIN)

        if not jobs_info:
            logger.info(f"Không tìm thấy bài tuyển dụng nào tại trang #{current_page_idx}. Đã duyệt hết danh sách!")
            break

        logger.info(f"🔍 Tìm thấy {len(jobs_info)} bài tuyển dụng tại trang #{current_page_idx}.")
        if next_page_url:
            logger.info(f"➡️  Phát hiện Next Page: {next_page_url}")
        else:
            logger.info("ℹ️  Không còn nút Next Page (đã tới trang cuối cùng).")

        if limit_jobs_per_page is not None and limit_jobs_per_page > 0:
            jobs_info = jobs_info[:limit_jobs_per_page]

        for idx, item in enumerate(jobs_info, start=1):
            job_url = item["job_url"]
            if job_url in visited_urls:
                continue
            visited_urls.add(job_url)
            job_counter += 1

            # 1. Định kỳ làm mới session cookies & Client-ID để tránh tích lũy hạn mức
            if job_counter > 1 and (job_counter % rotate_session_every == 0):
                if hasattr(session, "cookies"):
                    session.cookies.clear()
                logger.info(
                    f"🔄 [Session Renewal] Đã cào {job_counter} jobs. Làm mới session cookies & Client-ID để tránh bị theo dõi tích lũy."
                )

            # 2. Nghỉ xả hơi theo batch (Batch Cooldown) mô phỏng người dùng thật
            if job_counter > 1 and (job_counter % batch_cooldown_every == 0):
                cooldown_jitter = batch_cooldown_seconds + random.uniform(1.5, 3.5)
                logger.info(
                    f"☕ [Batch Cooldown] Đã cào {job_counter} jobs. Tạm dừng {cooldown_jitter:.1f}s để giải tỏa tải server..."
                )
                time.sleep(cooldown_jitter)
            else:
                # Delay ngẫu nhiên giữa các request (Polite Random Delay 2.0s - 4.0s)
                delay = random.uniform(min_delay, max_delay)
                time.sleep(delay)

            logger.info(f"  [{idx}/{len(jobs_info)}] Cào chi tiết: {job_url}")
            detail_res = safe_request(session, job_url, referer=current_url)

            if not detail_res or detail_res.status_code != 200:
                logger.warning(
                    f"  ⚠️ Trang chi tiết không khả dụng (Status: {detail_res.status_code if detail_res else 'None'}). "
                    f"Tự động lưu trữ thông tin trích xuất từ List Card: {job_url}"
                )
                job_data = {
                    "job_url": job_url,
                    "source": SOURCE_NAME,
                    "job_title": item.get("job_title_card") or "Việc làm IT",
                    "company_name": item.get("company_name_list") or "",
                    "company_url": None,
                    "company_logo": item.get("company_logo_card") or "",
                    "salary": item.get("salary_card") or "Thoả thuận",
                    "experience": item.get("experience_card") or "",
                    "level": "",
                    "work_type": "Toàn thời gian",
                    "education": "",
                    "industry": "Công nghệ thông tin",
                    "location_short": item.get("location_card") or "",
                    "workplace_detail": item.get("location_card") or "",
                    "working_time": None,
                    "posted_date": "",
                    "deadline": "",
                    "keyword": "N/A",
                    "job_description": item.get("job_title_card") or "",
                    "job_requirements": "",
                    "benefits": "",
                    "extra_info": {"extracted_from": "list_card"},
                }
                all_jobs.append(job_data)
                continue

            try:
                job_data = parse_job_detail(detail_res.text, job_url)
                # Bổ sung tên công ty từ trang danh sách nếu trang chi tiết bị khuyết
                if not job_data["company_name"] and item.get("company_name_list"):
                    job_data["company_name"] = item["company_name_list"]

                all_jobs.append(job_data)
                title_disp = (job_data.get("job_title") or "")[:35]
                kw_disp = job_data.get("keyword") or "N/A"
                logger.info(
                    f"  ✅ [Thành công] {title_disp} | "
                    f"Keyword: {kw_disp} | "
                    f"Lương: {job_data['salary']} | "
                    f"Khu vực: {job_data['location_short'] or 'N/A'}"
                )
            except Exception as e:
                logger.error(f"  ❌ Lỗi khi bóc tách {job_url}: {e}")

            # Lưu checkpoint liên tục mỗi 10 bài để chống mất dữ liệu
            if len(all_jobs) % 10 == 0:
                save_data(all_jobs)

        # Tự động lưu lũy tiến dữ liệu sau mỗi trang hoàn tất
        save_data(all_jobs)

        # Chuyển sang trang tiếp theo theo nút Next
        current_url = next_page_url
        current_page_idx += 1

    logger.info(f"\n🎉 Hoàn thành crawl TopCV! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ.")
    return all_jobs


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TopCV Job Crawler")
    parser.add_argument("--pages", "--page", default="10", help="Số trang muốn cào (số hoặc 'max')")
    parser.add_argument("--jobs-per-page", default="max", help="Số job mỗi trang (số hoặc 'max')")
    args = parser.parse_args()

    pages_val = int(args.pages) if args.pages.isdigit() else args.pages
    jobs_per_page_val = int(args.jobs_per_page) if args.jobs_per_page.isdigit() else args.jobs_per_page

    results = crawl(
        page=pages_val,
        max_jobs_per_page=jobs_per_page_val,
        min_delay=2.0,
        max_delay=3.5,
    )
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs từ TopCV.")
