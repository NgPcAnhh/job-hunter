"""
Crawler for Vieclam24h (https://vieclam24h.vn)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa theo cấu trúc DOM thực tế của Vieclam24h.

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

SOURCE_NAME = "vieclam24h"
BASE_DOMAIN = "https://vieclam24h.vn"
# Mặc định lọc ngành CNTT & Phần mềm (occupations[]=10) hoặc tìm kiếm chung
BASE_PAGINATION_URL = "https://vieclam24h.vn/tim-kiem-viec-lam-nhanh?page={page}&occupations[]=10"

# Thư mục lưu trữ Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "vieclam24h.csv"
OUTPUT_JSON = OUTPUT_DIR / "vieclam24h.json"

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
                if attempt >= 2:
                    logger.warning(
                        f"🛡️  [Anti-Ban / Captcha Blocked] Máy chủ Vieclam24h kích hoạt Bot Challenge trên IP Datacenter. "
                        f"Nếu chạy trên GitHub Actions, bạn có thể thêm secret HTTP_PROXY (Residential Proxy VN). "
                        f"Tạm dừng cào Vieclam24h để pipeline tiếp tục với các spider khác."
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


def extract_jobs_from_next_data(html: str, base_url: str = BASE_DOMAIN) -> List[Dict[str, Any]]:
    """
    Trích xuất danh sách việc làm trực tiếp từ thẻ <script id="__NEXT_DATA__">.
    Dữ liệu có sẵn cấu trúc hoàn chỉnh bao gồm tiêu đề, công ty, lương, địa điểm, yêu cầu...
    Giúp cào 30 jobs/trang chỉ với 1 request duy nhất mà không cần tải 30 trang chi tiết.
    """
    soup = BeautifulSoup(html, "html.parser")
    nxt = soup.find("script", id="__NEXT_DATA__")
    if not nxt or not nxt.text:
        return []

    try:
        data = json.loads(nxt.text)
        items = data.get("props", {}).get("initialState", {}).get("api", {}).get("getJobList", {}).get("data", {}).get("items", [])
        if not items:
            return []

        jobs: List[Dict[str, Any]] = []
        for item in items:
            jid = item.get("id")
            if not jid:
                continue
            slug = item.get("title_slug") or "viec-lam"
            job_url = f"{base_url.rstrip('/')}/{slug}-id{jid}.html"

            title = item.get("title") or ""
            emp_info = item.get("employer_info") or {}
            comp_name = emp_info.get("name") or ""
            comp_logo = emp_info.get("logo") or ""
            comp_url = emp_info.get("website") or None

            # Format lương
            sal_min = item.get("salary_min")
            sal_max = item.get("salary_max")
            if not sal_min and not sal_max:
                salary = "Thoả thuận"
            elif sal_min and sal_max:
                salary = f"{sal_min/1e6:g} - {sal_max/1e6:g} triệu VND"
            elif sal_min:
                salary = f"Từ {sal_min/1e6:g} triệu VND"
            else:
                salary = f"Tới {sal_max/1e6:g} triệu VND"

            # Địa điểm làm việc
            places = item.get("places") or []
            if isinstance(places, str):
                try:
                    places = json.loads(places)
                except Exception:
                    places = []

            loc_list = []
            short_locs = set()
            for p in places:
                if isinstance(p, dict):
                    addr = p.get("address")
                    if addr:
                        loc_list.append(addr)
                    p_name = p.get("province_name")
                    if p_name:
                        short_locs.add(p_name)

            workplace = "\n".join(loc_list) if loc_list else ""
            location_short = ", ".join(short_locs) if short_locs else "Toàn quốc"

            # Yêu cầu & mô tả
            raw_req = item.get("other_requirement") or item.get("other_requirement_html") or ""
            job_req = BeautifulSoup(raw_req, "html.parser").get_text(separator="\n", strip=True) if raw_req else ""
            job_desc = title

            # Hạn nộp hồ sơ & ngày đăng
            import datetime
            expired_ts = item.get("resume_apply_expired")
            deadline = ""
            if expired_ts and isinstance(expired_ts, (int, float)):
                try:
                    deadline = datetime.datetime.fromtimestamp(expired_ts).strftime("%d/%m/%Y")
                except Exception:
                    deadline = ""

            created_ts = item.get("created_at")
            posted_date = ""
            if created_ts and isinstance(created_ts, (int, float)):
                try:
                    posted_date = datetime.datetime.fromtimestamp(created_ts).strftime("%d/%m/%Y")
                except Exception:
                    posted_date = ""

            # Keywords
            smart_tags = item.get("smart_tags") or []
            tags = [t.get("name") for t in smart_tags if isinstance(t, dict) and t.get("name")]
            keyword = " ".join([f"{{{t}}}" for t in tags]) if tags else "N/A"

            jobs.append({
                "job_url": job_url,
                "source": SOURCE_NAME,
                "job_title": title,
                "company_name": comp_name,
                "company_url": comp_url,
                "company_logo": comp_logo,
                "salary": salary,
                "experience": str(item.get("experience_range", "")) if item.get("experience_range") else "",
                "level": str(item.get("level_requirement", "")) if item.get("level_requirement") else "",
                "work_type": "Toàn thời gian" if item.get("working_method") == 1 else "Bán thời gian",
                "education": str(item.get("degree_requirement", "")) if item.get("degree_requirement") else "",
                "industry": "Công nghệ thông tin",
                "location_short": location_short,
                "workplace_detail": workplace,
                "working_time": None,
                "posted_date": posted_date,
                "deadline": deadline,
                "keyword": keyword,
                "job_description": job_desc,
                "job_requirements": job_req,
                "benefits": "",
                "extra_info": {
                    "id": jid,
                    "gender": item.get("gender"),
                    "vacancy_quantity": item.get("vacancy_quantity"),
                    "probation_duration": item.get("probation_duration"),
                },
            })
        return jobs
    except Exception as e:
        logger.warning(f"Lỗi khi giải mã __NEXT_DATA__: {e}")
        return []


def get_job_links_from_page(html: str, base_url: str = BASE_DOMAIN) -> List[str]:
    """
    Quét qua danh sách các thẻ bài đăng trên trang tìm kiếm việc làm Vieclam24h.
    Lấy thuộc tính href trong các thẻ a có chứa mã định danh bài viết (id\d+\.html).
    Trả về List[str] các URL bài viết duy nhất.
    """
    soup = BeautifulSoup(html, "html.parser")
    job_urls: List[str] = []
    seen = set()

    for a_elem in soup.find_all("a", href=True):
        raw_href = a_elem.get("href")
        if not raw_href:
            continue
        # Nhận diện link chi tiết bài viết (dạng ...id\d+\.html)
        if re.search(r"id\d+\.html", raw_href):
            clean_href = raw_href.split("?")[0].strip()
            full_url = urljoin(base_url, clean_href)
            if full_url not in seen:
                seen.add(full_url)
                job_urls.append(full_url)

    return job_urls


def extract_keywords(soup: BeautifulSoup) -> str:
    """
    Trích xuất từ khóa từ khối 'Từ khoá' của Vieclam24h (Ảnh 2):
    - Tìm thẻ có text chính xác 'Từ khoá' (thường là div.text-14 chứa text 'Từ khoá')
    - Lấy container kế cận chứa các thẻ <a> (badge từ khóa)
    - Loại bỏ hoàn toàn dấu phẩy ',' và khoảng trắng thừa
    - Khử trùng lặp, giữ nguyên thứ tự
    - Trả về chuỗi dạng: '{kw_1} {kw_2} ...' trong 1 cột 'keyword'
    """
    keywords: List[str] = []

    # 1. Tìm theo nhãn 'Từ khoá'
    for elem in soup.find_all(["div", "h2", "h3", "h4", "span"]):
        if elem.get_text(strip=True).lower() == "từ khoá":
            parent = elem.parent
            if parent:
                tag_container = parent.select_one("div.flex.gap-3, div.flex-wrap") or parent
                for a in tag_container.find_all("a"):
                    text = a.get_text(strip=True).replace(",", "").strip()
                    if text and text not in keywords:
                        keywords.append(text)
            if keywords:
                break

    # 2. Fallback nếu class khác: tìm theo selector inline-block trong flex-wrap
    if not keywords:
        for a in soup.select("div.flex.flex-wrap a.inline-block, a[class*='bg-[#EEFFF0]']"):
            text = a.get_text(strip=True).replace(",", "").strip()
            if text and text not in keywords:
                keywords.append(text)

    if not keywords:
        return ""

    return " ".join([f"{{{kw}}}" for kw in keywords])


def parse_job_detail(html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách an toàn và đầy đủ các trường thông tin chi tiết từ bài đăng việc làm Vieclam24h:
    - Header:
        + job_title: Tên công việc (thẻ H1)
        + salary: Mức lương
        + location_short: Khu vực / địa điểm tóm tắt
        + experience: Kinh nghiệm
        + education: Trình độ / Yêu cầu bằng cấp
        + deadline: Hạn nộp hồ sơ (DD/MM/YYYY)
    - Từ khoá / Keyword (Ảnh 2):
        + keyword: Định dạng '{kw_1} {kw_2} ...' từ khối 'Từ khoá', loại bỏ dấu phẩy ','
    - Thông tin chung:
        + work_type: Hình thức làm việc (ví dụ: "Toàn thời gian cố định")
        + level: Cấp bậc (ví dụ: "Nhân viên")
        + posted_date: Ngày đăng (ví dụ: "10/09/2026")
        + gender: Yêu cầu giới tính (nếu có)
        + recruitment_num: Số lượng tuyển
        + age: Độ tuổi
        + probation_time: Thời gian thử việc
        + profession: Ngành nghề
    - Chi tiết công việc (các khối H2):
        + job_description: Text/lis trong container ngay sau H2 "Mô tả công việc"
        + job_requirements: Text/lis trong container ngay sau H2 "Yêu cầu công việc"
        + benefits: Text/lis trong container ngay sau H2 "Quyền lợi"
        + skills: Text trong khối sau H2 "Kỹ năng cần thiết"
        + workplace: Danh sách địa chỉ sau H2 "Địa điểm làm việc"
    - Thông tin công ty:
        + company_name: Tên nhà tuyển dụng từ cột bên phải
    """
    soup = BeautifulSoup(html, "html.parser")

    # 1. Tên công việc (H1)
    h1_elem = soup.select_one("h1")
    job_title = safe_text(h1_elem)

    # 2. Thông tin tóm tắt ngay bên dưới H1 (Lương, Khu vực, Kinh nghiệm, Trình độ)
    salary = ""
    location_short = ""
    experience = ""
    education = ""

    if h1_elem and h1_elem.parent:
        for d in h1_elem.parent.select(".flex.flex-col"):
            parts = list(d.stripped_strings)
            if len(parts) >= 2:
                lbl = parts[0].lower()
                val = ", ".join(parts[1:]) if "," not in parts[1:] else "".join(parts[1:])
                val = val.replace(" , ", ", ")
                if "lương" in lbl:
                    salary = val
                elif "khu vực" in lbl or "địa điểm" in lbl:
                    location_short = val
                elif "kinh nghiệm" in lbl:
                    experience = val
                elif "trình độ" in lbl or "bằng cấp" in lbl:
                    education = val

    # Hạn nộp hồ sơ
    deadline = ""
    dl_match = re.search(r"Hạn nộp hồ sơ[:\s]*([0-9/]+)", soup.get_text())
    if dl_match:
        deadline = dl_match.group(1).strip()

    # 3. Tên công ty & Logo (từ cột thông tin nhà tuyển dụng bên phải - Ảnh DevTools)
    company_name = ""
    company_elem = soup.select_one("div.text-18.font-medium, a.flex.w-full")
    if company_elem and "vieclam24h" not in safe_text(company_elem).lower():
        company_name = safe_text(company_elem)

    company_logo = ""
    logo_img = soup.select_one(
        'a[href*="/danh-sach-tin-tuyen-dung-cong-ty"] img, '
        'img[data-image="cdn"], '
        'a[class*="rounded-[8px]"] img, '
        'a[class*="rounded-"] img[src*="cdn.vieclam24h.vn"], '
        'img[src*="cdn.vieclam24h.vn/images/default"], '
        'img[src*="cdn.vieclam24h.vn/images/employer"], '
        'div[class*="items-center justify-center"] img'
    )
    if logo_img:
        raw_logo = logo_img.get("src") or logo_img.get("data-src") or ""
        if raw_logo:
            company_logo = urljoin(BASE_DOMAIN, raw_logo.strip())
        if not company_name and logo_img.get("alt"):
            company_name = logo_img.get("alt").strip()

    # 4. Khối Thông tin chung
    general_info: Dict[str, str] = {}
    for h2 in soup.find_all("h2"):
        if "thông tin chung" in safe_text(h2).lower():
            nxt = h2.find_next_sibling()
            if nxt:
                for cell in nxt.select("div.flex.flex-col"):
                    parts = list(cell.stripped_strings)
                    if len(parts) >= 2:
                        k = parts[0].strip().lower()
                        v = " ".join(parts[1:]).strip()
                        general_info[k] = v
            break

    work_type = general_info.get("hình thức làm việc", "")
    level = general_info.get("cấp bậc", "")
    posted_date = general_info.get("ngày đăng", "")
    gender = general_info.get("yêu cầu giới tính", "")
    recruitment_num = general_info.get("số lượng tuyển", "")
    age = general_info.get("độ tuổi", "")
    probation_time = general_info.get("thời gian thử việc", "")
    profession = general_info.get("ngành nghề", "")

    # Nếu kinh nghiệm hoặc bằng cấp ở header trống, bổ sung từ thông tin chung
    if not experience:
        experience = general_info.get("yêu cầu kinh nghiệm", "")
    if not education:
        education = general_info.get("yêu cầu bằng cấp", "")

    # Trích xuất từ khóa / keyword từ khối 'Từ khoá' (Ảnh 2)
    keyword = extract_keywords(soup)

    # 5. Các khối nội dung chi tiết theo H2
    def extract_h2_content(keywords: List[str]) -> str:
        for h2 in soup.find_all("h2"):
            h2_text = safe_text(h2).lower()
            if any(kw in h2_text for kw in keywords):
                nxt = h2.find_next_sibling()
                if nxt:
                    lis = nxt.select("ul li, ol li, li")
                    if lis:
                        return "\n".join([safe_text(li) for li in lis if safe_text(li)])
                    ps = nxt.select("p")
                    if ps:
                        return "\n".join([safe_text(p) for p in ps if safe_text(p)])
                    return safe_text(nxt, sep="\n")
        return ""

    job_description = extract_h2_content(["mô tả công việc", "mô tả"])
    job_requirements = extract_h2_content(["yêu cầu công việc", "yêu cầu"])
    benefits = extract_h2_content(["quyền lợi"])

    # Kỹ năng cần thiết
    skills = ""
    for h2 in soup.find_all("h2"):
        if "kỹ năng cần thiết" in safe_text(h2).lower():
            nxt = h2.find_next_sibling()
            if nxt:
                parts = [s for s in nxt.stripped_strings if s != "•"]
                skills = " • ".join(parts)
            break

    # Địa điểm làm việc chi tiết
    workplace_lines: List[str] = []
    for h2 in soup.find_all("h2"):
        if "địa điểm làm việc" in safe_text(h2).lower():
            nxt = h2.find_next_sibling()
            if nxt:
                for d in nxt.select("div.flex"):
                    parts = list(d.stripped_strings)
                    if parts:
                        line = " ".join(parts).replace(" : ", ": ").replace(" :", ": ")
                        if line and line not in workplace_lines and len(line) > 5:
                            workplace_lines.append(line)
            break
    workplace = "\n".join(workplace_lines)

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
        "industry": profession,
        "location_short": location_short,
        "workplace_detail": workplace,
        "working_time": None,
        "posted_date": posted_date,
        "deadline": deadline,
        "keyword": keyword,
        "job_description": job_description,
        "job_requirements": job_requirements,
        "benefits": benefits,
        "extra_info": {
            "gender": gender,
            "recruitment_num": recruitment_num,
            "age": age,
            "probation_time": probation_time,
            "skills": skills,
        },
    }


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu trực tiếp vào bảng riêng `jobs_vieclam24h` trên Supabase và lưu backup JSON."""
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
    kết hợp giả lập TLS Fingerprint của Chrome thật để kết nối trực tiếp ổn định.
    """
    if HAS_CURL_CFFI:
        session_kwargs: Dict[str, Any] = {
            "impersonate": "chrome120",
            "timeout": 30,
        }
        if proxy:
            session_kwargs["proxies"] = {"http": proxy, "https": proxy}
        return curl_requests.Session(**session_kwargs)
    else:
        session = curl_requests.Session()
        if proxy:
            session.proxies = {"http": proxy, "https": proxy}
        return session


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
    Tiến trình cào dữ liệu Vieclam24h hoàn chỉnh:
    - Tham số page / max_pages:
        + Mặc định: 10 trang.
        + Nếu đặt "max" (hoặc None): cào liên tục tất cả các trang cho tới khi hết bài đăng hoặc status khác 200.
        + Nếu đặt số (ví dụ: page=10): chỉ cào từ trang 1 đến hết trang 10 thì dừng.
    - Tham số max_jobs_per_page:
        + Mặc định: "max" (lấy toàn bộ job trên trang).
        + Nếu đặt số N (ví dụ: 3): chỉ lấy N jobs trên mỗi trang để test nhanh.
    - Trích xuất chuyên sâu Từ khoá / Keyword:
        + Định dạng '{a} {b} {c}' trong cột 'keyword', loại bỏ dấu phẩy ','.
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

    logger.info(f"🚀 Bắt đầu crawl Vieclam24h: {BASE_PAGINATION_URL.format(page=1)}")
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

        # 1. Ưu tiên trích xuất trực tiếp toàn bộ dữ liệu cấu trúc qua __NEXT_DATA__ (chỉ 1 request/trang)
        next_jobs = extract_jobs_from_next_data(res.text, base_url=BASE_DOMAIN)
        if next_jobs:
            if limit_jobs_per_page is not None and limit_jobs_per_page > 0:
                next_jobs = next_jobs[:limit_jobs_per_page]

            new_added = 0
            for job_data in next_jobs:
                j_url = job_data.get("job_url")
                if j_url and j_url not in visited_urls:
                    visited_urls.add(j_url)
                    all_jobs.append(job_data)
                    new_added += 1
                    job_counter += 1
                    title_disp = (job_data.get("job_title") or "")[:35]
                    comp_disp = (job_data.get("company_name") or "N/A")[:25]
                    kw_disp = job_data.get("keyword") or "N/A"
                    logger.info(
                        f"  ✅ [Next Data] {title_disp} | Công ty: {comp_disp} | "
                        f"Keyword: {kw_disp} | Lương: {job_data['salary']}"
                    )

            logger.info(f"🎯 Đã trích xuất trực tiếp {new_added} jobs từ __NEXT_DATA__ trang #{current_page}.")
            save_data(all_jobs)
            current_page += 1
            time.sleep(random.uniform(min_delay, max_delay))
            continue

        # 2. Fallback bóc tách danh sách link bài viết nếu __NEXT_DATA__ không có sẵn
        job_urls = get_job_links_from_page(res.text, base_url=BASE_DOMAIN)
        if not job_urls:
            logger.info(f"Không còn bài tuyển dụng nào ở trang #{current_page}. Đã duyệt hết toàn bộ danh sách tin!")
            break

        logger.info(f"Tìm thấy {len(job_urls)} bài tuyển dụng tại trang #{current_page}.")

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
                logger.warning(f"  ❌ Bỏ qua job do không tải được: {job_url}")
                continue

            try:
                job_data = parse_job_detail(detail_res.text, job_url)
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

    logger.info(f"\n🎉 Hoàn thành crawl Vieclam24h! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ.")
    return all_jobs


if __name__ == "__main__":
    # TÙY CHỌN CẤU HÌNH KHI CHẠY:
    # - page: 
    #     + Mặc định: 10 trang theo yêu cầu.
    #     + Nếu đặt "max": cào liên tục tất cả các trang cho tới khi hết tin tuyển dụng thì thôi.
    #     + Nếu đặt số (ví dụ: page=10): chỉ cào từ trang 1 đến trang số 10.
    # - max_jobs_per_page: Số job tối đa mỗi trang ("max" = cào TOÀN BỘ jobs trên trang, hoặc đặt số nguyên)
    # - min_delay, max_delay: Thời gian nghỉ ngẫu nhiên giữa các job (chống chặn IP)
    
    results = crawl(
        page=10,                 # Mặc định lấy 10 trang theo yêu cầu
        max_jobs_per_page="max", # Mặc định cào toàn bộ job trên mỗi trang (30 bài/trang)
        min_delay=1.2,
        max_delay=2.5,
    )
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs.")
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs.")
