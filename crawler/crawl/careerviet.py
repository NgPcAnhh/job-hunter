"""
Crawler for CareerViet (https://careerviet.vn)
Lấy danh sách việc làm CNTT & Phần mềm và trích xuất chi tiết từng bài đăng theo cấu trúc DOM thực tế.
Lưu kết quả dạng CSV (UTF-8 with BOM) và JSON vào thư mục: crawler/model/bronze/

Tích hợp sẵn các cơ chế chống chặn IP (Anti-Bot / Anti-IP Ban):
1. Rotating User-Agents & Modern Browser Headers.
2. Randomized Polite Delay (Nghỉ ngẫu nhiên 1.0s - 2.0s).
3. Exponential Backoff & Retry trong hàm safe_request().
4. Trích xuất chuyên sâu Job Tags / Skills (keyword) từ khối div.job-tags:
   Lưu dưới định dạng '{tag_1} {tag_2} ...' trong cột 'keyword', loại bỏ hoàn toàn dấu phẩy ','.
5. Hỗ trợ tham số phân trang chuẩn:
   - page: Mặc định là 10 trang (hoặc 'max' để cào toàn bộ).
   - max_jobs_per_page: Mặc định là 'max' (hoặc số nguyên N để test nhanh).
6. Tự động lưu lũy tiến (Incremental Auto-Save) đồng thời vào cả CSV và JSON.
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

import httpx
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

# Cấu hình logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

SOURCE_NAME = "careerviet"
BASE_URL = "https://careerviet.vn/viec-lam/cntt-phan-mem-c1d3-vi.html"
BASE_DOMAIN = "https://careerviet.vn"

# Đường dẫn lưu trữ thư mục Bronze
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "model" / "bronze"
OUTPUT_CSV = OUTPUT_DIR / "careerviet.csv"
OUTPUT_JSON = OUTPUT_DIR / "careerviet.json"
OUTPUT_FILE = OUTPUT_CSV  # Giữ alias cho tương thích ngược

# Danh sách User-Agents thực tế để luân phiên (tránh fingerprint cố định)
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:129.0) Gecko/20100101 Firefox/129.0",
]


def get_random_headers(referer: Optional[str] = None) -> Dict[str, str]:
    """Tạo bộ HTTP Header hoàn chỉnh mô phỏng trình duyệt người dùng thật."""
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin" if referer else "none",
        "Sec-Fetch-User": "?1",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def safe_request(
    client: httpx.Client,
    url: str,
    max_retries: int = 4,
    initial_backoff: float = 4.0,
    referer: Optional[str] = None
) -> Optional[httpx.Response]:
    """
    Hàm gửi request an toàn bảo vệ chống chặn IP (Anti-Ban / Anti-Tarpit):
    - Tự động luân phiên User-Agent và Referer.
    - Xử lý timeout/drop connection tự động bằng Exponential Backoff.
    - Phát hiện các mã lỗi giới hạn tần suất (429, 503) hoặc bot detection.
    """
    backoff = initial_backoff

    for attempt in range(1, max_retries + 1):
        headers = get_random_headers(referer=referer)

        try:
            response = client.get(url, headers=headers)

            if response.status_code == 200:
                return response

            if response.status_code == 404:
                logger.info(f"Trang trả về 404 Not Found: {url}")
                return response

            if response.status_code in [429, 403, 503]:
                logger.warning(
                    f"⚠️  [HTTP {response.status_code}] Tạm dừng {backoff:.1f}s trước khi thử lại ({attempt}/{max_retries})..."
                )
                time.sleep(backoff)
                backoff *= 2
                continue

            logger.warning(f"Request {url} trả về HTTP {response.status_code}")
            return response

        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError, httpx.RequestError) as e:
            logger.warning(
                f"⚠️  [Kết nối bị giữ/Timeout] Lần #{attempt}/{max_retries}: {type(e).__name__}. "
                f"Đang chờ hạ nhiệt {backoff:.1f}s..."
            )
            time.sleep(backoff)
            backoff *= 2

    logger.error(f"❌ Không thể truy cập {url} sau {max_retries} lần thử.")
    return None


def get_job_links(page_html: str, base_url: str = BASE_DOMAIN) -> List[str]:
    """
    Tìm tất cả thẻ a.job_link trong div.job-item trên trang danh sách.
    Chuẩn hóa full URL bằng urllib.parse.urljoin.
    """
    soup = BeautifulSoup(page_html, "html.parser")
    job_urls: List[str] = []

    job_elements = soup.select("div.job-item a.job_link, .job-item a.job_link")

    for a_tag in job_elements:
        raw_href = a_tag.get("href")
        if raw_href:
            clean_href = raw_href.strip()
            full_url = urljoin(base_url, clean_href)
            if full_url not in job_urls:
                job_urls.append(full_url)

    return job_urls


def get_page_url(page: int) -> str:
    """Sinh URL phân trang chuẩn của CareerViet cho từng trang."""
    return f"https://careerviet.vn/viec-lam/cntt-phan-mem-ngan-hang-thuong-mai-dien-tu-c1,19,73d3-trang-{page}-vi.html"


def extract_keywords(soup: BeautifulSoup) -> str:
    """
    Trích xuất danh sách Job Tags / Skills từ khối DOM:
    - Tìm thẻ div.job-tags (chứa h2 'Job Tags / Skills' và danh sách ul > li > a)
    - Lấy text từng thẻ a (hoặc thuộc tính title)
    - Loại bỏ hoàn toàn dấu phẩy ',' và khoảng trắng thừa
    - Loại bỏ trùng lặp giữ nguyên thứ tự
    - Định dạng đầu ra: '{tag_1} {tag_2} ...' trong 1 cột 'keyword'
    """
    tags: List[str] = []

    # 1. Tìm trực tiếp theo selector chuẩn div.job-tags ul li a
    tag_elements = soup.select("div.job-tags ul li a, .job-tags ul li a, div.job-tags a")
    for elem in tag_elements:
        text = elem.get_text(strip=True).replace(",", "").strip()
        if not text:
            text = (elem.get("title") or "").replace(",", "").strip()
        if text and text not in tags:
            tags.append(text)

    # 2. Fallback nếu class thay đổi: tìm qua tiêu đề section chứa text "job tags" hoặc "skills"
    if not tags:
        for h2 in soup.find_all(["h2", "h3"]):
            h2_text = h2.get_text().lower()
            if "job tags" in h2_text or "skills" in h2_text:
                parent = h2.find_parent(class_=lambda c: c and "job-tags" in c) or h2.parent
                if parent:
                    for a in parent.find_all("a"):
                        text = a.get_text(strip=True).replace(",", "").strip()
                        if not text:
                            text = (a.get("title") or "").replace(",", "").strip()
                        if text and text not in tags:
                            tags.append(text)
                break

    # 3. Fallback auxiliary: hidden input keyword_txthbe nếu có
    if not tags:
        hidden_kw = soup.select_one("input#keyword_txthbe, input[name='keyword_txthbe']")
        if hidden_kw and hidden_kw.get("value"):
            val = hidden_kw.get("value").replace(",", "").strip()
            if val and val not in tags:
                tags.append(val)

    if not tags:
        return ""

    # Định dạng theo mẫu: {a} {b} {c}
    return " ".join([f"{{{t}}}" for t in tags])


def parse_job_detail(detail_html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách toàn bộ thông tin chi tiết một bài đăng việc làm từ DOM CareerViet.
    Áp dụng cơ chế Safe Extraction để tránh lỗi NoneType khi một số trường bị khuyết.
    """
    soup = BeautifulSoup(detail_html, "html.parser")

    # 1. Header chi tiết (Ảnh 2)
    # job_title: h1.title bên trong div.job-desc
    job_title_elem = soup.select_one("div.job-desc h1.title, h1.title")
    job_title = job_title_elem.get_text(strip=True) if job_title_elem else None

    # company_name & company_url: a.employer.job-company-name
    comp_a = soup.select_one("a.employer.job-company-name, .employer.job-company-name")
    company_name = None
    company_url = None
    if comp_a:
        company_name = comp_a.get_text(strip=True)
        raw_comp_href = comp_a.get("href")
        company_url = urljoin(BASE_DOMAIN, raw_comp_href.strip()) if raw_comp_href else None

    # 2. Khối thông tin cơ bản / Tổng quan (Ảnh 3 & 4)
    # Lặp qua các thẻ li trong div.detail-box
    updated_at = None
    industry = None
    work_type = None
    salary = None
    experience = None
    level = None
    expired_at = None

    detail_box_items = soup.select("div.detail-box li, .detail-box li")
    for li in detail_box_items:
        strong_elem = li.select_one("strong")
        p_elem = li.select_one("p")

        if not strong_elem:
            continue

        label = strong_elem.get_text(strip=True).lower()

        if "ngày cập nhật" in label:
            updated_at = p_elem.get_text(strip=True) if p_elem else None

        elif "ngành nghề" in label:
            if p_elem:
                a_tags = p_elem.find_all("a")
                if a_tags:
                    industry = ", ".join([a.get_text(strip=True) for a in a_tags if a.get_text(strip=True)])
                else:
                    industry = p_elem.get_text(strip=True)

        elif "hình thức" in label:
            work_type = p_elem.get_text(strip=True) if p_elem else None

        elif "lương" in label:
            salary = p_elem.get_text(strip=True) if p_elem else None

        elif "kinh nghiệm" in label:
            raw_exp = p_elem.get_text(strip=True) if p_elem else None
            if raw_exp:
                # Chuẩn hóa khoảng trắng ví dụ 25Năm -> 25 Năm
                experience = re.sub(r"(\d+)\s*(năm|tháng)", r"\1 \2", raw_exp, flags=re.IGNORECASE)
            else:
                experience = None

        elif "cấp bậc" in label:
            level = p_elem.get_text(strip=True) if p_elem else None

        elif "hết hạn nộp" in label or "hạn nộp" in label:
            expired_at = p_elem.get_text(strip=True) if p_elem else None

    # Trích xuất keyword / Job Tags từ khối div.job-tags theo định dạng {a} {b} {c}
    keyword = extract_keywords(soup)

    # 3. Khối nội dung chi tiết (Ảnh 5) trong section.job-detail-content
    job_description = None
    job_requirements = None

    # Lặp qua các khối div.detail-row để tìm đúng tiêu đề
    detail_rows = soup.select("section.job-detail-content div.detail-row, div.detail-row")
    for row in detail_rows:
        title_elem = row.select_one("h2.detail-title, h2, .detail-title")
        if not title_elem:
            continue

        section_title = title_elem.get_text(strip=True).lower()

        # Mô tả Công việc
        if "mô tả công việc" in section_title:
            content_div = row.select_one("div.content_fck") or row
            p_list = [p.get_text(strip=True) for p in content_div.find_all(["p", "li"]) if p.get_text(strip=True)]
            if p_list:
                job_description = "\n".join(p_list)
            else:
                temp_text = content_div.get_text(separator="\n", strip=True)
                job_description = temp_text.replace(title_elem.get_text(strip=True), "").strip()

        # Yêu cầu Công việc
        elif "yêu cầu công việc" in section_title:
            content_div = row.select_one("div.content_fck") or row
            p_list = [p.get_text(strip=True) for p in content_div.find_all(["p", "li"]) if p.get_text(strip=True)]
            if p_list:
                job_requirements = "\n".join(p_list)
            else:
                temp_text = content_div.get_text(separator="\n", strip=True)
                job_requirements = temp_text.replace(title_elem.get_text(strip=True), "").strip()

    # 4. Địa điểm làm việc (Ảnh 5)
    # div.detail-row.info-place-detail (kết hợp div.place-name và text thẻ span)
    working_location = None
    loc_row = soup.select_one("div.detail-row.info-place-detail, .info-place-detail")
    if loc_row:
        place_name_elem = loc_row.select_one("div.place-name, .place-name")
        span_elem = loc_row.select_one("span")

        place_name = place_name_elem.get_text(strip=True) if place_name_elem else ""
        address_text = span_elem.get_text(strip=True) if span_elem else ""

        if place_name and address_text:
            if place_name in address_text:
                working_location = address_text
            else:
                working_location = f"{place_name} - {address_text}"
        else:
            working_location = address_text or place_name or loc_row.get_text(separator=" ", strip=True)
    else:
        # Fallback tìm trong link địa điểm nếu có
        map_link = soup.select_one("a[href*='tim-viec-lam-tai']")
        if map_link:
            working_location = map_link.get_text(strip=True)

    return {
        "job_url": job_url,
        "source": SOURCE_NAME,
        "job_title": job_title,
        "company_name": company_name,
        "company_url": company_url,
        "company_logo": None,
        "salary": salary,
        "experience": experience,
        "level": level,
        "work_type": work_type,
        "education": None,
        "industry": industry,
        "location_short": None,
        "workplace_detail": working_location,
        "working_time": None,
        "posted_date": updated_at,
        "deadline": expired_at,
        "keyword": keyword,
        "job_description": job_description,
        "job_requirements": job_requirements,
        "benefits": None,
        "extra_info": {},
    }


def save_data(jobs: List[Dict[str, Any]], csv_path: Path = OUTPUT_CSV, json_path: Path = OUTPUT_JSON) -> None:
    """Lưu dữ liệu trực tiếp vào bảng riêng `jobs_careerviet` trên Supabase và lưu backup JSON."""
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


def save_to_csv(jobs: List[Dict[str, Any]], output_path: Path = OUTPUT_CSV) -> None:
    """Hàm bọc tương thích ngược với code cũ."""
    save_data(jobs, csv_path=output_path)


def crawl(
    page: Union[int, str, None] = 10,
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 1.0,
    max_delay: float = 2.0,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 6.0,
    proxy: Optional[str] = None,
    max_pages: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Tiến trình crawl toàn diện cho CareerViet:
    - page:
        + Mặc định: 10 trang.
        + Nếu đặt "max" hoặc None: cào cho tới khi hết trang hoặc lỗi 404.
        + Nếu đặt số N: cào tối đa N trang.
    - max_jobs_per_page:
        + Mặc định "max": lấy toàn bộ bài đăng trên mỗi trang danh sách.
        + Nếu đặt số N (vd: 3): chỉ lấy N jobs/trang để test nhanh.
    - Trích xuất chuyên sâu Job Tags / Skills dưới dạng '{tag1} {tag2} ...' trong cột 'keyword'.
    - Tự động lưu lũy tiến vào cả CSV UTF-8-sig và JSON trong thư mục bronze.
    """
    # Xử lý tham số phân trang
    effective_page_limit = page if max_pages is None else max_pages
    limit_pages: Optional[int] = None
    if isinstance(effective_page_limit, int):
        limit_pages = effective_page_limit
    elif isinstance(effective_page_limit, str) and effective_page_limit.strip().isdigit():
        limit_pages = int(effective_page_limit.strip())

    limit_jobs_per_page: Optional[int] = None
    if isinstance(max_jobs_per_page, int):
        limit_jobs_per_page = max_jobs_per_page
    elif isinstance(max_jobs_per_page, str) and max_jobs_per_page.strip().isdigit():
        limit_jobs_per_page = int(max_jobs_per_page.strip())

    logger.info(f"🚀 Bắt đầu crawl {SOURCE_NAME}...")
    logger.info(
        f"⚙️  Cấu hình: Page = {limit_pages if limit_pages else 'MAX (Toàn bộ trang)'} | "
        f"Jobs/Page = {limit_jobs_per_page if limit_jobs_per_page else 'MAX (Toàn bộ)'} | "
        f"Delay = {min_delay}s - {max_delay}s | Cooldown = {batch_cooldown_seconds}s mỗi {batch_cooldown_every} jobs"
    )

    crawled_jobs: List[Dict[str, Any]] = []
    visited_job_urls = set()
    job_counter = 0

    client_kwargs: Dict[str, Any] = {
        "timeout": 30.0,
        "follow_redirects": True,
    }
    if proxy:
        client_kwargs["proxy"] = proxy

    client = httpx.Client(**client_kwargs)

    current_page = 1
    try:
        while True:
            if limit_pages and current_page > limit_pages:
                logger.info(f"Đã đạt giới hạn {limit_pages} trang được cấu hình. Dừng phân trang.")
                break

            page_url = get_page_url(current_page)
            logger.info(f"\n📄 Đang tải trang danh sách #{current_page}: {page_url}")

            res = safe_request(client, page_url, max_retries=3, initial_backoff=4.0)
            if not res or res.status_code == 404:
                logger.info(f"Trang #{current_page} không tồn tại hoặc lỗi (HTTP {res.status_code if res else 'None'}). Kết thúc phân trang.")
                break

            # Lấy danh sách link job
            job_urls = get_job_links(res.text, base_url=BASE_DOMAIN)
            if not job_urls:
                logger.info(f"Không tìm thấy việc làm nào ở trang #{current_page}. Đã cào hết toàn bộ trang!")
                break

            # Lọc bỏ các URL đã cào trước đó
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

                detail_res = safe_request(client, j_url, max_retries=3, initial_backoff=5.0, referer=page_url)
                if not detail_res or detail_res.status_code != 200:
                    logger.warning(f"  [#{idx}/{len(new_job_urls)}] Bỏ qua job {j_url}")
                    continue

                job_data = parse_job_detail(detail_res.text, job_url=j_url)

                if not job_data.get("job_title"):
                    logger.warning(f"  [#{idx}] Không bóc tách được job_title tại {j_url}. Bỏ qua.")
                    continue

                crawled_jobs.append(job_data)
                title_disp = (job_data.get("job_title") or "")[:40]
                kw_disp = job_data.get("keyword") or "N/A"
                logger.info(f"  ✅ [#{len(crawled_jobs)}] {title_disp} | Keyword: {kw_disp}")

                # Lưu lũy tiến định kỳ vào CSV & JSON sau mỗi 5 job
                if len(crawled_jobs) % 5 == 0:
                    save_data(crawled_jobs)

            # Lưu sau mỗi trang hoàn tất
            save_data(crawled_jobs)
            current_page += 1

    finally:
        client.close()

    if crawled_jobs:
        save_data(crawled_jobs)

    logger.info(f"\n🎉 Hoàn thành xuất sắc! Đã cào tổng cộng {len(crawled_jobs)} jobs vào: {OUTPUT_CSV}")
    return crawled_jobs


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="CareerViet Anti-Ban Job Crawler")
    parser.add_argument("--page", type=str, default="10", help="Số trang cần crawl (mặc định: 10, hoặc 'max' để cào toàn bộ)")
    parser.add_argument("--max-jobs-per-page", type=str, default="max", help="Số job tối đa mỗi trang (mặc định: max)")
    parser.add_argument("--min-delay", type=float, default=1.0, help="Thời gian nghỉ tối thiểu (giây)")
    parser.add_argument("--max-delay", type=float, default=2.0, help="Thời gian nghỉ tối đa (giây)")
    parser.add_argument("--proxy", type=str, default=None, help="Địa chỉ Proxy nếu có (vd: http://user:pass@ip:port)")
    args = parser.parse_args()

    results = crawl(
        page=args.page,
        max_jobs_per_page=args.max_jobs_per_page,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        proxy=args.proxy
    )
    print(f"\n[{SOURCE_NAME}] Kết thúc! Đã lưu {len(results)} jobs vào {OUTPUT_CSV}")
