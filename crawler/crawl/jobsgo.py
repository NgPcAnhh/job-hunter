"""
Crawler for JobsGO (https://jobsgo.vn)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa theo cấu trúc DOM thực tế của JobsGO.

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

SOURCE_NAME = "jobsgo"
BASE_DOMAIN = "https://jobsgo.vn"
BASE_PAGINATION_URL = "https://jobsgo.vn/nganh-nghe.html?slug=viec-lam-cong-nghe-thong-tin&page={page}"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "jobsgo.csv"
OUTPUT_JSON = OUTPUT_DIR / "jobsgo.json"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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
                        if alt_res.status_code == 200 and not check_is_captcha_or_challenge(alt_res):
                            logger.info(f"🎉 Vượt Cloudflare thành công bằng profile '{alt_imp}'!")
                            return alt_res
                    except Exception as alt_err:
                        logger.debug(f"Thử profile {alt_imp} thất bại: {alt_err}")

                # Nếu TLS profile không qua được và gặp Cloudflare Challenge -> Gọi Stealth Browser giải Turnstile!
                try:
                    from crawler.utils.browser_solver import fetch_with_stealth_browser, sync_cookies_to_session
                    logger.info(f"🌐 [Cloudflare WAF 403] Kích hoạt Stealth Headless Browser giải Turnstile tại: {url}...")
                    b_res = fetch_with_stealth_browser(url)
                    if b_res and b_res.status_code == 200:
                        logger.info(f"🎉 [Stealth Browser] Vượt Cloudflare thành công! Đồng bộ cookie phiên...")
                        sync_cookies_to_session(session, b_res.cookies)
                        return b_res
                except Exception as b_err:
                    logger.debug(f"Lỗi khi kích hoạt browser solver: {b_err}")

                if attempt >= 2:
                    logger.warning(
                        f"🛡️  [Anti-Ban / Captcha Blocked] Máy chủ JobsGO kích hoạt Bot Challenge trên IP Datacenter. "
                        f"Kích hoạt cơ chế dự phòng tự động..."
                    )
                    return None
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
    Quét qua danh sách các khối 'div.col-grid' trên trang danh sách việc làm (Ảnh 1).
    Lấy thuộc tính href trong thẻ 'h3.job-title a', dùng urllib.parse.urljoin chuẩn hóa thành URL tuyệt đối.
    Trả về List[str].
    """
    soup = BeautifulSoup(html, "html.parser")
    col_grids = soup.select("div.job-list div.col-grid, div.col-grid")

    job_urls: List[str] = []
    seen = set()

    for col in col_grids:
        try:
            a_elem = col.select_one("h3.job-title a, div.job-title a, .job-title a")
            if not a_elem or not a_elem.get("href"):
                continue

            raw_href = a_elem.get("href").strip()
            full_url = urljoin(base_url, raw_href)

            if full_url not in seen:
                seen.add(full_url)
                job_urls.append(full_url)
        except Exception:
            continue

    return job_urls


def get_job_cards_metadata(html: str, base_url: str = BASE_DOMAIN) -> Dict[str, Dict[str, str]]:
    """
    Trích xuất metadata bổ trợ từ các card ở trang danh sách (Ảnh 1):
    - job_url: Link chi tiết
    - job_title_list: Text hoặc thuộc tính title của thẻ <a> trong h3.job-title
    - company_name: Text của thẻ <a> trong div.company-title
    """
    soup = BeautifulSoup(html, "html.parser")
    col_grids = soup.select("div.job-list div.col-grid, div.col-grid")
    metadata_map: Dict[str, Dict[str, str]] = {}

    for col in col_grids:
        try:
            a_title = col.select_one("h3.job-title a, div.job-title a, .job-title a")
            if not a_title or not a_title.get("href"):
                continue

            full_url = urljoin(base_url, a_title.get("href").strip())
            title_text = a_title.get("title") or safe_text(a_title)

            comp_elem = col.select_one("div.company-title a, a.company-title, .company-title")
            company_name = safe_text(comp_elem)

            logo_elem = col.select_one("img[src*='employer'], div.company-logo img, img.company-logo")
            card_logo = ""
            if logo_elem:
                raw_logo_src = logo_elem.get("src") or logo_elem.get("data-src") or ""
                if raw_logo_src and ("employer" in raw_logo_src or "jobsgo.vn" in raw_logo_src):
                    card_logo = urljoin(base_url, raw_logo_src.strip())

            sal_elem = col.select_one(".salary, .job-salary, [class*='salary']")
            card_salary = safe_text(sal_elem) or "Thoả thuận"

            loc_elem = col.select_one(".location, .job-location, [class*='location'], [class*='address']")
            card_location = safe_text(loc_elem)

            metadata_map[full_url] = {
                "job_title_list": title_text,
                "company_name": company_name,
                "company_logo": card_logo,
                "salary": card_salary,
                "location": card_location,
            }
        except Exception:
            continue

    return metadata_map


def extract_keywords(soup: BeautifulSoup) -> str:
    """
    Trích xuất danh sách Ngành nghề (keywords) từ DOM bài tuyển dụng JobsGO:
    - Tìm khối d-flex chứa label 'Ngành nghề:' (text-muted nằm cạnh icon pb-heroicons-squares-2x2)
    - Lấy text từ các thẻ <a> trong thẻ <strong>
    - Loại bỏ hoàn toàn dấu phẩy ',' và khoảng trắng thừa
    - Loại bỏ trùng lặp giữ nguyên thứ tự
    - Lưu dưới định dạng: '{nganh_1} {nganh_2} ...' trong 1 cột 'keyword'
    """
    keywords: List[str] = []

    # 1. Tìm trong khối job-detail-card hoặc khối nội dung chính
    # Thẻ text-muted có text chính xác là 'ngành nghề:' hoặc 'ngành nghề'
    for label_div in soup.find_all(class_=lambda c: c and "text-muted" in c):
        txt = label_div.get_text(strip=True).lower().rstrip(":")
        if txt == "ngành nghề":
            parent = label_div.parent
            if parent:
                strong_elem = parent.find("strong")
                if strong_elem:
                    a_tags = strong_elem.find_all("a")
                    if a_tags:
                        for a in a_tags:
                            text = a.get_text(strip=True).replace(",", "").strip()
                            if text and text not in keywords:
                                keywords.append(text)
                    else:
                        # Fallback nếu không có thẻ a, tách chuỗi theo dấu phẩy
                        raw_text = strong_elem.get_text(strip=True)
                        for part in raw_text.split(","):
                            clean = part.replace(",", "").strip()
                            if clean and clean not in keywords:
                                keywords.append(clean)
            if keywords:
                break

    # 2. Fallback qua icon pb-heroicons-squares-2x2 nếu class thay đổi
    if not keywords:
        icon = soup.select_one("i.pb-heroicons-squares-2x2, i[class*='squares-2x2'], i[class*='squares-four']")
        if icon:
            container = icon.find_parent(class_=lambda c: c and "d-flex" in c)
            if container:
                for a in container.select("strong a, a"):
                    text = a.get_text(strip=True).replace(",", "").strip()
                    if text and text not in keywords:
                        keywords.append(text)

    if not keywords:
        return ""

    # Định dạng theo mẫu: {a} {b} {c}
    return " ".join([f"{{{kw}}}" for kw in keywords])


def parse_job_detail(html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách an toàn (safe extract) các trường dữ liệu chi tiết đưa vào một Python Dictionary:
    1. Header & Thông tin cơ bản (Ảnh 2 - div.card-body & ul.job-info-list):
        - job_url: Link job đang crawl
        - job_title: Text trong thẻ h1.job-title
        - salary: Text trong strong của li chứa text "Mức lương:"
        - location / location_short: Text trong strong của li chứa text "Địa điểm:"
        - experience: Text trong strong của li chứa text "Kinh nghiệm:"
        - education: Text trong strong của li chứa text "Bằng cấp:" (hoặc thuộc tính title)
    2. Thông tin chung (Ảnh 2 - cột phải div.card.job-card):
        - work_type: Text bên cạnh label "Loại hình:"
        - level: Text bên cạnh label "Cấp bậc:"
        - posted_date: Text bên cạnh label "Ngày đăng tuyển:"
    3. Ngành nghề / Keyword (Ảnh 4 - khối d-flex chứa label 'Ngành nghề:'):
        - keyword: Lưu theo mẫu '{a} {b} {c}', loại bỏ hoàn toàn dấu phẩy ','
    4. Khối Chi tiết công việc (Ảnh 3 - div.job-detail-card):
        - job_description: Gom text tất cả các thẻ li trong ul ngay sau h3 chứa text "Mô Tả Công Việc:"
        - job_requirements: Gom text tất cả các thẻ li trong ul ngay sau h3 chứa text "Yêu Cầu Công Việc:"
        - benefits: Gom text tất cả các thẻ li trong ul ngay sau h3 chứa text "Quyền Lợi Được Hưởng:"
    """
    soup = BeautifulSoup(html, "html.parser")

    # 1. job_title (Ảnh 2: h1.job-title trong div.card-body)
    h1_elem = soup.select_one("div.card-body h1.job-title, h1.job-title, h1")
    job_title = safe_text(h1_elem)

    # 2. Bốn thuộc tính tổng quan trong ul.job-info-list (Ảnh 2)
    salary = ""
    location = ""
    experience = ""
    education = ""

    for li in soup.select("ul.job-info-list li"):
        try:
            label_elem = li.select_one("span.text-muted")
            str_elem = li.select_one("strong")
            if not str_elem:
                continue

            label = safe_text(label_elem).lower()
            # Ưu tiên lấy thuộc tính title (nếu có, ví dụ: "Trung học phổ thông" thay vì "THPT trở lên")
            val = str_elem.get("title") or safe_text(str_elem)

            if "lương" in label:
                salary = val
            elif "địa điểm" in label:
                location = val
            elif "kinh nghiệm" in label:
                experience = val
            elif "bằng cấp" in label:
                education = val
        except Exception:
            continue

    # 3. Thông tin chung ở cột phải (Ảnh 2)
    work_type = ""
    level = ""
    posted_date = ""

    # Quét qua các dòng thông tin chung trong thẻ card cạnh bên
    for row in soup.select("div.card.job-card .col-12, div.row.gy-3 .col-12"):
        try:
            label_span = row.select_one("span.text-muted")
            str_elem = row.select_one("strong")
            if not str_elem:
                continue

            label = safe_text(label_span).lower()
            val = safe_text(str_elem)

            if "loại hình" in label:
                work_type = val
            elif "cấp bậc" in label:
                level = val
            elif "ngày đăng tuyển" in label or "đăng tuyển" in label:
                posted_date = val
        except Exception:
            continue

    # 4. Tên & Logo công ty tuyển dụng (Ảnh DevTools: img trong card nhà tuyển dụng ở sidebar phải)
    company_name = ""
    company_logo = ""
    logo_el = soup.select_one(
        'img[src*="media.jobsgo.vn/media/img/employer"], '
        'img.border.rounded.bg-white, '
        'div.card-body img[src*="employer"], '
        'div[class*="card"] img[class*="border"][class*="rounded"], '
        'div#sidebar-jobs img[src*="employer"], '
        'div#sidebar-jobs img'
    )
    if logo_el:
        raw_logo = logo_el.get("src") or logo_el.get("data-src") or ""
        if raw_logo:
            company_logo = urljoin(BASE_DOMAIN, raw_logo.strip())
        if logo_el.get("alt"):
            company_name = logo_el.get("alt").strip()

    if not company_name:
        comp_title = soup.select_one(
            "div.card-body h4, div.card-body h5, "
            "h4.company-name, h5.company-name, "
            "div#sidebar-jobs h4, div#sidebar-jobs h5"
        )
        if comp_title:
            company_name = safe_text(comp_title)

    # 5. Trích xuất ngành nghề / keyword theo định dạng {a} {b} {c}
    keyword = extract_keywords(soup)

    # 6. Nội dung chi tiết trong div.job-detail-card (Ảnh 3)
    def extract_section_items(heading_keywords: List[str]) -> str:
        """
        Tìm thẻ h3 chứa text từ khóa tương ứng, lấy thẻ ul kế tiếp
        và gom text toàn bộ thẻ li thành một chuỗi (nối bằng \n).
        """
        headings = soup.select("div.job-detail-card h3, div.job-detail-card h2, h3.section-title, h3")
        for h in headings:
            h_text = safe_text(h).lower()
            if any(kw in h_text for kw in heading_keywords):
                nxt_ul = h.find_next("ul")
                if nxt_ul:
                    # Đảm bảo thẻ ul này thuộc section hiện tại (không nằm sau heading khác)
                    prev_h = nxt_ul.find_previous(["h2", "h3"])
                    if prev_h == h:
                        top_lis = nxt_ul.find_all("li", recursive=False) or nxt_ul.find_all("li")
                        lis = [safe_text(li) for li in top_lis if safe_text(li)]
                        if lis:
                            return "\n".join(lis)
        return ""

    job_description = extract_section_items(["mô tả công việc", "mô tả"])
    job_requirements = extract_section_items(["yêu cầu công việc", "yêu cầu"])
    benefits = extract_section_items(["quyền lợi được hưởng", "quyền lợi", "chế độ"])

    return {
        "job_url": job_url,
        "source": SOURCE_NAME,
        "job_title": job_title,
        "company_name": company_name,
        "company_url": None,
        "company_logo": company_logo,
        "salary": salary,
        "experience": experience,
        "level": level,
        "work_type": work_type,
        "education": education,
        "industry": None,
        "location_short": location,
        "workplace_detail": location,
        "working_time": None,
        "posted_date": posted_date,
        "deadline": None,
        "keyword": keyword,
        "job_description": job_description,
        "job_requirements": job_requirements,
        "benefits": benefits,
        "extra_info": {},
    }


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu trực tiếp vào bảng riêng `jobs_jobsgo` trên Supabase và lưu backup JSON."""
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


def crawl_from_sitemap(session: Any, max_jobs: int = 50) -> List[Dict[str, Any]]:
    """
    Cơ chế cào dự phòng khi trang tìm kiếm bị Cloudflare WAF chặn IP Datacenter:
    - Đọc file sitemap: https://jobsgo.vn/sitemap-job.xml (sitemap không bị WAF chặn).
    - Lọc các bài đăng thuộc ngành CNTT / IT / Lập trình theo từ khóa URL.
    - Cào trực tiếp trang chi tiết từng bài đăng.
    """
    logger.info("🗺️ [Sitemap Fallback] Đang tải danh sách việc làm từ JobsGO Sitemap...")
    it_keywords = [
        "developer", "engineer", "it", "lap-trinh", "phan-mem", "tester",
        "frontend", "backend", "fullstack", "java", "python", "react", "php",
        "net", "data", "ai", "tech", "system", "cloud", "devops", "security",
        "qa", "qc", "cntt", "mobile", "ios", "android", "embedded", "golang"
    ]

    candidate_urls: List[str] = []
    try:
        r = session.get("https://jobsgo.vn/sitemap-job.xml", timeout=20)
        if r.status_code == 200:
            found_urls = re.findall(r"<loc>(https://jobsgo\.vn/viec-lam/[^<]+)</loc>", r.text)
            for u in found_urls:
                u_clean = u.split("?")[0].strip()
                if any(kw in u_clean.lower() for kw in it_keywords):
                    if u_clean not in candidate_urls:
                        candidate_urls.append(u_clean)
                    if len(candidate_urls) >= max_jobs * 2:
                        break
    except Exception as e:
        logger.debug(f"Lỗi khi đọc sitemap JobsGO: {e}")

    logger.info(f"🗺️ [Sitemap Fallback] Tìm thấy {len(candidate_urls)} việc làm IT tiềm năng từ Sitemap.")

    extracted_jobs: List[Dict[str, Any]] = []
    target_urls = candidate_urls[:max_jobs]

    for idx, job_url in enumerate(target_urls, start=1):
        time.sleep(random.uniform(1.2, 2.5))
        logger.info(f"  [{idx}/{len(target_urls)}] [Sitemap] Cào chi tiết: {job_url}")
        res = safe_request(session, job_url, referer="https://jobsgo.vn/")
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

    logger.info(f"🎉 [Sitemap Fallback] Thu thập thành công {len(extracted_jobs)} việc làm IT JobsGO.")
    return extracted_jobs


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
    Tiến trình cào dữ liệu JobsGO hoàn chỉnh:
    - Tham số page / max_pages:
        + Mặc định: 10 trang.
        + Nếu đặt "max" (hoặc None): cào liên tục tất cả các trang cho tới khi không còn thẻ job nào (div.col-grid rỗng) hoặc status khác 200.
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

    logger.info(f"🚀 Bắt đầu crawl JobsGO: {BASE_PAGINATION_URL.format(page=1)}")
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
            if current_page == 1:
                logger.warning(
                    f"⚠️ Không thể tải trang danh sách #{current_page} (Status: {res.status_code if res else 'None'}). "
                    f"Kích hoạt cơ chế dự phòng: Cào việc làm IT trực tiếp từ Sitemap JobsGO..."
                )
                target_jobs_count = (limit_num or 5) * (limit_jobs_per_page or 10)
                sitemap_jobs = crawl_from_sitemap(session, max_jobs=target_jobs_count)
                if sitemap_jobs:
                    all_jobs.extend(sitemap_jobs)
                    save_data(all_jobs)
            else:
                logger.warning(f"Không thể tải trang #{current_page} (Status: {res.status_code if res else 'None'}). Kết thúc crawl.")
            break

        last_referer = list_url

        # Bóc tách danh sách link bài viết từ div.col-grid
        job_urls = get_job_links_from_page(res.text, base_url=BASE_DOMAIN)
        if not job_urls:
            logger.info(f"Không còn job card nào ở trang #{current_page} (div.col-grid rỗng). Đã duyệt hết toàn bộ danh sách tin!")
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
            detail_res = safe_request(session, job_url, referer=list_url)

            if not detail_res or detail_res.status_code != 200:
                meta = cards_metadata.get(job_url, {})
                logger.warning(
                    f"  ⚠️ Trang chi tiết không khả dụng (Status: {detail_res.status_code if detail_res else 'None'}). "
                    f"Tự động lưu trữ thông tin trích xuất từ List Card: {job_url}"
                )
                job_data = {
                    "job_url": job_url,
                    "source": SOURCE_NAME,
                    "job_title": meta.get("job_title_list") or "Việc làm IT",
                    "company_name": meta.get("company_name", ""),
                    "company_url": None,
                    "company_logo": meta.get("company_logo", ""),
                    "salary": meta.get("salary", "Thoả thuận"),
                    "experience": "",
                    "level": "",
                    "work_type": "Toàn thời gian",
                    "education": "",
                    "industry": "Công nghệ thông tin",
                    "location_short": meta.get("location", ""),
                    "workplace_detail": meta.get("location", ""),
                    "working_time": None,
                    "posted_date": "",
                    "deadline": "",
                    "keyword": "N/A",
                    "job_description": meta.get("job_title_list") or "",
                    "job_requirements": "",
                    "benefits": "",
                    "job_title_list": meta.get("job_title_list", ""),
                    "extra_info": {"extracted_from": "list_card"},
                }
                all_jobs.append(job_data)
                continue

            try:
                job_data = parse_job_detail(detail_res.text, job_url)

                # Gắn thêm trường trích xuất từ card danh sách (Ảnh 1)
                meta = cards_metadata.get(job_url, {})
                job_data["job_title_list"] = meta.get("job_title_list", "")
                if not job_data.get("company_name"):
                    job_data["company_name"] = meta.get("company_name", "")
                if not job_data.get("company_logo") and meta.get("company_logo"):
                    job_data["company_logo"] = meta.get("company_logo", "")

                if not job_data["job_title"] and job_data["job_title_list"]:
                    job_data["job_title"] = job_data["job_title_list"]

                all_jobs.append(job_data)
                title_disp = (job_data.get("job_title") or "")[:35]
                comp_disp = (job_data.get("company_name") or "N/A")[:25]
                kw_disp = job_data.get("keyword") or "N/A"
                logger.info(
                    f"  ✅ [Thành công] {title_disp} | Công ty: {comp_disp} | "
                    f"Keyword: {kw_disp} | Lương: {job_data['salary']}"
                )
            except Exception as e:
                logger.error(f"  ❌ Lỗi khi bóc tách {job_url}: {e}")

        # Tự động lưu lũy tiến dữ liệu sau mỗi trang hoàn tất
        save_data(all_jobs)
        current_page += 1

    try:
        from crawler.utils.browser_solver import close_global_solver
        close_global_solver()
    except Exception:
        pass

    logger.info(f"\n🎉 Hoàn thành crawl JobsGO! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ.")
    return all_jobs


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="JobsGO Job Crawler")
    parser.add_argument("--pages", "--page", default="10", help="Số trang muốn cào (số hoặc 'max')")
    parser.add_argument("--jobs-per-page", default="max", help="Số job mỗi trang (số hoặc 'max')")
    args = parser.parse_args()

    pages_val = int(args.pages) if args.pages.isdigit() else args.pages
    jobs_per_page_val = int(args.jobs_per_page) if args.jobs_per_page.isdigit() else args.jobs_per_page

    results = crawl(
        page=pages_val,
        max_jobs_per_page=jobs_per_page_val,
        min_delay=1.2,
        max_delay=2.5,
    )
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs từ JobsGO.")
