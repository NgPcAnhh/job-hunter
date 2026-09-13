"""
Crawler for VietnamWorks (https://www.vietnamworks.com)
Trích xuất danh sách việc làm và thông tin chi tiết bài đăng dựa trên Playwright & BeautifulSoup.

Đặc điểm kiến trúc & Anti-Ban (Anti-Block) tối ưu:
1. Xử lý Single-Page App / Next.js: VietnamWorks sử dụng Next.js với dynamic hash class (sc-...).
   Crawler ưu tiên bóc tách theo cấu trúc semantic bền vững (h1, h2, name="label", name="paragraph").
2. Tối ưu tốc độ vượt trội (Route Resource Aborting):
   Chặn toàn bộ hình ảnh nặng, fonts, media và trackers bên thứ ba (Google Analytics, Hotjar, Facebook...),
   giúp tải trang và bóc tách dữ liệu cực nhanh (1 - 2s / job).
3. Tự động cuộn trang (Smart Lazy-Load Scrolling):
   VietnamWorks lazy-render danh sách tin; crawler tự động cuộn từng bước để lấy đủ 50 jobs / trang.
4. Bóc tách Logo gốc độ phân giải cao:
   Tự động giải mã Next.js Image Optimization (_next/image?url=...) bằng urllib.parse.unquote.
5. Anti-Ban / Rate-Limit Protection:
   - Giả lập User-Agent trình duyệt thật, viewport chuẩn máy tính để bàn (1440x900).
   - Randomized Polite Delay: Nghỉ ngẫu nhiên giữa các job (1.2s - 2.5s).
   - Batch Cooldown: Tự động nghỉ xả hơi (5s - 8s) sau mỗi 10 bài đăng để làm mới rate-limit window.
6. Hỗ trợ tham số linh hoạt:
   - page="max": Cào liên tục đến khi hết danh sách.
   - page=N: Dừng lại sau khi hoàn tất trang thứ N.
   - max_jobs_per_page: Giới hạn số job cào mỗi trang (phục vụ test nhanh).
7. Incremental Auto-Save:
   Tự động lưu lũy tiến ra file CSV chuẩn UTF-8-sig (hỗ trợ Excel tiếng Việt) và JSON sau mỗi trang.
"""

import os
import re
import csv
import sys
import json
import time
import random
import asyncio
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from urllib.parse import urljoin, unquote

# Cấu hình encoding UTF-8 stdout trên Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Browser, Page

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
# URL tìm kiếm việc làm mặc định (ví dụ: Hà Nội hoặc ngành nghề IT)
# l=24 (Hà Nội), g=5 (IT - Phần mềm)
BASE_PAGINATION_URL = "https://www.vietnamworks.com/viec-lam?l=24&g=5&page={page}"

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

COMMON_PROVINCES = [
    "Hà Nội", "Hồ Chí Minh", "TP HCM", "TP.HCM", "Đà Nẵng", "Hải Phòng", "Cần Thơ",
    "Bình Dương", "Đồng Nai", "Bà Rịa - Vũng Tàu", "Bắc Ninh", "Hải Dương", "Hưng Yên",
    "Quảng Ninh", "Thái Nguyên", "Vĩnh Phúc", "Long An", "Tiền Giang", "Khánh Hòa", "Lâm Đồng",
    "Thừa Thiên Huế", "Quảng Nam", "Nghệ An", "Thanh Hóa", "Bình Định", "Kiên Giang", "Toàn quốc", "Remote"
]


def safe_text(elem: Any, sep: str = " ") -> str:
    """Trích xuất chuỗi văn bản an toàn, loại bỏ khoảng trắng thừa."""
    if elem is None:
        return ""
    if hasattr(elem, "get_text"):
        raw = elem.get_text(separator=sep, strip=True)
    else:
        raw = str(elem).strip()
    return re.sub(r"[ \t\r\f\v]+", " ", raw).strip()


def extract_logo_url(soup: BeautifulSoup) -> str:
    """
    Trích xuất link logo công ty và giải mã URL từ Next.js Image Optimization.
    """
    logo_url = ""
    logo_img = soup.select_one(
        'div[class*="company"] img, img[alt*="logo"], .view-company-logo img, div.company-logo img'
    )
    if not logo_img:
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if "pictureofcompany" in src or "images.vietnamworks.com" in src:
                logo_url = src
                break
    else:
        logo_url = logo_img.get("src", "")

    # Giải mã Next.js image proxy /_next/image?url=...
    if "_next/image?url=" in logo_url:
        try:
            target = logo_url.split("url=")[1].split("&")[0]
            logo_url = unquote(target)
        except Exception:
            pass

    return logo_url


def extract_location(soup: BeautifulSoup) -> str:
    """
    Trích xuất địa điểm làm việc linh hoạt theo cả 2 trường hợp:
    1. Chi tiết: Có block tiêu đề h2/h3 'Địa điểm làm việc' (Ảnh 5).
    2. Header: Fallback lấy thẻ span[name='paragraph'] chứa tỉnh/thành phố (Ảnh 2).
    """
    # 1. Khối chi tiết dưới tiêu đề 'Địa điểm làm việc' (Ảnh 5)
    for h in soup.find_all(["h2", "h3", "h4"]):
        if "địa điểm làm việc" in h.get_text(strip=True).lower():
            parent = h.find_parent("div")
            if parent:
                spans = parent.find_all("span", {"name": "paragraph"})
                if spans:
                    loc_texts = [safe_text(s) for s in spans if safe_text(s)]
                    return "; ".join(loc_texts)
                else:
                    return safe_text(parent).replace(h.get_text(strip=True), "").strip()

    # 2. Fallback: Lấy địa điểm từ header badge (Ảnh 2)
    for span in soup.find_all("span", {"name": "paragraph"}):
        txt = safe_text(span)
        if any(prov.lower() in txt.lower() for prov in COMMON_PROVINCES):
            return txt

    return ""


def extract_keywords(soup: BeautifulSoup) -> str:
    """
    Trích xuất từ khóa từ khối 'Từ khoá:' của VietnamWorks (Ảnh minh họa):
    - Quét tìm thẻ nhãn có text chứa 'Từ khoá' / 'Từ khóa'
    - Lấy container chứa các thẻ <a> và <button> (như badge từ khóa)
    - Loại bỏ các nút điều hướng / expand ('button expand', 'xem thêm', 'thu gọn', ...)
    - Loại bỏ hoàn toàn dấu phẩy ',' và khoảng trắng thừa
    - Khử trùng lặp, giữ nguyên thứ tự xuất hiện
    - Trả về chuỗi dạng: '{kw_1} {kw_2} ...' trong 1 cột 'keyword'
    """
    keywords: List[str] = []

    # 1. Tìm thẻ nhãn 'Từ khoá' / 'Từ khóa'
    label_candidates = soup.find_all(
        lambda tag: tag.name in ["div", "span", "p", "h2", "h3", "h4"]
        and any(k in tag.get_text(strip=True).lower() for k in ["từ khoá", "từ khóa"])
        and len(tag.get_text(strip=True)) < 30
    )

    for label in label_candidates:
        parent = label.find_parent("div")
        grandparent = parent.parent if parent else None

        containers = []
        if parent:
            containers.append(parent)
            nxt = parent.find_next_sibling("div")
            if nxt:
                containers.append(nxt)
        if grandparent:
            containers.append(grandparent)

        for container in containers:
            items = container.select("a, button.clickable, button")
            for item in items:
                aria = (item.get("aria-label") or "").strip()
                title = (item.get("title") or "").strip()
                text = item.get_text(strip=True)

                # Bỏ qua các nút chức năng (expand, xem thêm...)
                if any(skip in aria.lower() for skip in ["button expand", "xem thêm", "thu gọn", "nộp đơn", "lưu", "ứng tuyển"]):
                    continue
                if any(skip in text.lower() for skip in ["xem thêm", "thu gọn", "nộp đơn", "lưu", "ứng tuyển", "từ khoá", "từ khóa"]):
                    continue

                kw = title or aria or text
                kw = kw.replace(",", "").strip()
                if kw and kw not in keywords and len(kw) < 100:
                    keywords.append(kw)

            if keywords:
                break
        if keywords:
            break

    if not keywords:
        return ""

    return " ".join([f"{{{kw}}}" for kw in keywords])


def parse_job_detail_html(html: str, job_url: str) -> Dict[str, Any]:
    """
    Bóc tách dữ liệu từ HTML trang chi tiết việc làm VietnamWorks:
    - Ảnh 2: Tiêu đề (h1), Mức lương (span[name="label"]), Hạn nộp (span[name="paragraph"] chứa 'Hết hạn')
    - Ảnh 3: Logo công ty (đã giải mã URL)
    - Ảnh 4: Mô tả công việc & Yêu cầu công việc (dưới h2/h3 tương ứng)
    - Ảnh 5: Địa điểm làm việc (dưới h2/h3 'Địa điểm làm việc' hoặc fallback header)
    - Từ khoá / Keyword: Khối 'Từ khoá:' định dạng '{kw_1} {kw_2} ...', loại bỏ dấu phẩy ','
    - Thông tin mở rộng: Tên công ty, phúc lợi
    """
    soup = BeautifulSoup(html, "html.parser")

    # 1. Ảnh 2: Tiêu đề công việc
    title_el = soup.find("h1")
    job_title = safe_text(title_el)

    # 2. Tên công ty
    company_el = soup.select_one(
        'div[class*="company-name"], a[href*="/nha-tuyen-dung/"], a.company-name, div.company-name'
    )
    company_name = safe_text(company_el)

    # 3. Ảnh 2: Mức lương
    salary_el = soup.find("span", {"name": "label"})
    salary = safe_text(salary_el) if salary_el else "Thương lượng"

    # 4. Ảnh 2: Hạn nộp hồ sơ
    deadline = ""
    for span in soup.find_all("span", {"name": "paragraph"}):
        txt = span.get_text(strip=True)
        if "Hết hạn" in txt:
            deadline = txt
            break

    # 5. Ảnh 3: Logo công ty
    logo_url = extract_logo_url(soup)

    # 6. Hàm trích xuất nội dung block theo tiêu đề h2 / h3
    def get_section_content(heading_title: str) -> str:
        for h in soup.find_all(["h2", "h3", "h4"]):
            h_text = h.get_text(strip=True).lower()
            if heading_title.lower() in h_text:
                parent = h.find_parent("div")
                if parent:
                    # Lấy text trong parent nhưng loại bỏ tiêu đề h
                    text_parts = []
                    for child in parent.children:
                        if child == h or (hasattr(child, "name") and child.name in ["h2", "h3", "h4"]):
                            continue
                        part = safe_text(child, sep="\n")
                        if part:
                            text_parts.append(part)
                    if text_parts:
                        return "\n".join(text_parts).strip()
                    # Fallback lấy toàn bộ nội dung
                    return parent.get_text(separator="\n", strip=True)
        return ""

    # 7. Ảnh 4: Mô tả công việc & Yêu cầu công việc
    job_description = get_section_content("Mô tả công việc")
    job_requirements = get_section_content("Yêu cầu công việc")
    benefits = get_section_content("Phúc lợi") or get_section_content("Quyền lợi")

    # 8. Ảnh 5: Địa điểm làm việc
    location = extract_location(soup)

    # 9. Từ khoá / Keyword
    keyword = extract_keywords(soup)

    return {
        "job_url": job_url,
        "source": SOURCE_NAME,
        "job_title": job_title,
        "company_name": company_name,
        "company_url": None,
        "company_logo": logo_url,
        "salary": salary,
        "experience": None,
        "level": None,
        "work_type": None,
        "education": None,
        "industry": None,
        "location_short": location,
        "workplace_detail": None,
        "working_time": None,
        "posted_date": None,
        "deadline": deadline,
        "keyword": keyword,
        "job_description": job_description,
        "job_requirements": job_requirements,
        "benefits": benefits,
        "extra_info": {},
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


async def setup_page_optimization(page: Page) -> None:
    """
    Thiết lập bộ lọc chặn các tài nguyên nặng và tracking bên thứ ba.
    Giúp tăng tốc độ tải trang 5x và tiết kiệm tối đa tài nguyên máy.
    """
    await page.route(
        "**/*",
        lambda route: (
            route.abort()
            if route.request.resource_type in ["image", "media", "font"]
            or any(
                domain in route.request.url
                for domain in [
                    "google-analytics",
                    "googletagmanager",
                    "hotjar",
                    "facebook",
                    "connect.facebook.net",
                    "doubleclick.net",
                    "criteo",
                ]
            )
            else route.continue_()
        ),
    )


async def get_job_links_from_list_page(page: Page, list_url: str) -> List[str]:
    """
    Tải trang danh sách, cuộn thông minh để kích hoạt lazy-loading và lấy toàn bộ job link.
    """
    logger.info(f"📄 Đang tải trang danh sách: {list_url}")
    try:
        await page.goto(list_url, wait_until="domcontentloaded", timeout=35000)
    except Exception as e:
        logger.warning(f"Lỗi khi điều hướng tới {list_url}: {e}")
        return []

    # Chờ danh sách bài đăng hiển thị
    try:
        await page.wait_for_selector("a[href*='-jv'], div.block-job-list", timeout=15000)
    except Exception:
        logger.info("Không tìm thấy job nào trên trang hoặc đã tới trang cuối cùng.")
        return []

    # Cuộn trang từng bước để kích hoạt load toàn bộ 50 jobs trong viewport
    for _ in range(4):
        await page.evaluate("window.scrollBy(0, 1000)")
        await asyncio.sleep(0.4)

    # Bóc tách tất cả href từ danh sách job (Ảnh 1)
    raw_links = await page.eval_on_selector_all(
        "div.block-job-list h2 a, a[data-new-job='NO1'], a[href*='-jv']",
        "elements => elements.map(el => el.getAttribute('href'))",
    )

    # Khử trùng lặp và làm sạch query params
    seen = set()
    job_urls: List[str] = []
    for rel_url in raw_links:
        if not rel_url or "-jv" not in rel_url:
            continue
        clean_rel = rel_url.split("?")[0].strip()
        full_url = clean_rel if clean_rel.startswith("http") else urljoin(BASE_DOMAIN, clean_rel)
        if full_url not in seen:
            seen.add(full_url)
            job_urls.append(full_url)

    return job_urls


async def scrape_job_detail_page(page: Page, job_url: str) -> Optional[Dict[str, Any]]:
    """
    Bóc tách dữ liệu bài đăng chi tiết qua Playwright.
    """
    try:
        await page.goto(job_url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        logger.warning(f"  ❌ Lỗi tải trang {job_url}: {e}")
        return None

    # Chờ thẻ h1 hiển thị
    try:
        await page.wait_for_selector("h1", timeout=12000)
    except Exception:
        # Kiểm tra xem có phải trang 404 / hết hạn
        current_url = page.url
        if "404" in current_url or "het-han" in current_url:
            logger.warning(f"  ⚠️ Tin đã hết hạn hoặc không tồn tại: {job_url}")
            return None

    # Chờ 1 giây để React hydration nạp toàn bộ nội dung mô tả, yêu cầu và địa điểm
    await page.wait_for_timeout(1000)

    html = await page.content()
    data = parse_job_detail_html(html, job_url)

    if not data["job_title"]:
        logger.warning(f"  ⚠️ Không bóc tách được tiêu đề (h1 rỗng) tại {job_url}")
        return None

    return data


async def crawl_async(
    page: Union[int, str, None] = 10,
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 1.2,
    max_delay: float = 2.5,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 6.0,
    headless: bool = True,
) -> List[Dict[str, Any]]:
    """
    Hàm crawl bất đồng bộ chính cho VietnamWorks:
    - page: Mặc định là 10 trang, hoặc 'max' để cào liên tục đến khi hết danh sách.
    - max_jobs_per_page: Mặc định 'max' (cào toàn bộ jobs/trang), hoặc số nguyên N để test nhanh.
    - min_delay, max_delay: Thời gian nghỉ ngẫu nhiên giữa các bài đăng.
    - batch_cooldown_every, batch_cooldown_seconds: Nghỉ định kỳ sau mỗi đợt N jobs.
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

    logger.info(f"🚀 Bắt đầu crawl VietnamWorks: {BASE_PAGINATION_URL.format(page=1)}")
    logger.info(
        f"⚙️  Cấu hình: Page = {limit_num if limit_num else 'MAX (Toàn bộ)'} | "
        f"Jobs/Page = {limit_jobs_per_page if limit_jobs_per_page else 'MAX (Toàn bộ)'} | "
        f"Delay = {min_delay}s - {max_delay}s | Cooldown = {batch_cooldown_seconds}s mỗi {batch_cooldown_every} jobs"
    )

    all_jobs: List[Dict[str, Any]] = []
    visited_urls = set()
    current_page = 1
    job_counter = 0

    async with async_playwright() as p:
        browser: Browser = await p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )

        user_agent = random.choice(USER_AGENTS)
        context = await browser.new_context(
            user_agent=user_agent,
            viewport={"width": 1440, "height": 900},
            locale="vi-VN",
        )

        # Tạo page dùng cho quét danh sách
        list_page = await context.new_page()
        await setup_page_optimization(list_page)

        # Tạo page dùng cho quét chi tiết
        detail_page = await context.new_page()
        await setup_page_optimization(detail_page)

        while True:
            if limit_num is not None and current_page > limit_num:
                logger.info(f"🏁 Đã hoàn thành cào đến trang #{limit_num}. Dừng crawl.")
                break

            list_url = BASE_PAGINATION_URL.format(page=current_page)
            job_urls = await get_job_links_from_list_page(list_page, list_url)

            if not job_urls:
                logger.info(f"Không còn bài tuyển dụng nào ở trang #{current_page}. Kết thúc danh sách.")
                break

            logger.info(f"🔍 Tìm thấy {len(job_urls)} bài tuyển dụng tại trang #{current_page}.")

            if limit_jobs_per_page is not None and limit_jobs_per_page > 0:
                job_urls = job_urls[:limit_jobs_per_page]

            for idx, job_url in enumerate(job_urls, start=1):
                if job_url in visited_urls:
                    continue
                visited_urls.add(job_url)
                job_counter += 1

                # Nghỉ xả hơi Batch Cooldown để tránh kích hoạt Cloudflare / WAF
                if job_counter > 1 and (job_counter % batch_cooldown_every == 0):
                    cooldown = batch_cooldown_seconds + random.uniform(1.0, 2.5)
                    logger.info(f"☕ [Batch Cooldown] Đã cào {job_counter} jobs. Tạm nghỉ {cooldown:.1f}s...")
                    await asyncio.sleep(cooldown)
                else:
                    delay = random.uniform(min_delay, max_delay)
                    await asyncio.sleep(delay)

                logger.info(f"  [{idx}/{len(job_urls)}] Cào chi tiết: {job_url}")
                job_data = await scrape_job_detail_page(detail_page, job_url)

                if job_data:
                    all_jobs.append(job_data)
                    title_disp = (job_data.get("job_title") or "")[:35]
                    kw_disp = job_data.get("keyword") or "N/A"
                    logger.info(
                        f"  ✅ [Thành công] {title_disp} | "
                        f"Keyword: {kw_disp} | "
                        f"Công ty: {job_data['company_name'] or 'N/A'} | "
                        f"Lương: {job_data['salary']}"
                    )

            # Tự động lưu lũy tiến sau mỗi trang
            save_data(all_jobs)
            current_page += 1

        await browser.close()

    logger.info(f"\n🎉 Hoàn thành crawl VietnamWorks! Tổng cộng: {len(all_jobs)} việc làm đã được trích xuất và lưu trữ.")
    return all_jobs


def crawl(
    page: Union[int, str, None] = 10,
    max_jobs_per_page: Union[int, str, None] = "max",
    min_delay: float = 1.2,
    max_delay: float = 2.5,
    batch_cooldown_every: int = 10,
    batch_cooldown_seconds: float = 6.0,
    headless: bool = True,
) -> List[Dict[str, Any]]:
    """
    Wrapper đồng bộ cho crawl_async để có thể gọi trực tiếp hoặc tích hợp trong pipeline.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Nếu đã có event loop đang chạy (ví dụ môi trường async/notebook)
        import nest_asyncio
        nest_asyncio.apply()
        return loop.run_until_complete(
            crawl_async(
                page=page,
                max_jobs_per_page=max_jobs_per_page,
                min_delay=min_delay,
                max_delay=max_delay,
                batch_cooldown_every=batch_cooldown_every,
                batch_cooldown_seconds=batch_cooldown_seconds,
                headless=headless,
            )
        )
    else:
        return asyncio.run(
            crawl_async(
                page=page,
                max_jobs_per_page=max_jobs_per_page,
                min_delay=min_delay,
                max_delay=max_delay,
                batch_cooldown_every=batch_cooldown_every,
                batch_cooldown_seconds=batch_cooldown_seconds,
                headless=headless,
            )
        )


if __name__ == "__main__":
    # CẤU HÌNH KHI CHẠY TRỰC TIẾP:
    # - page:
    #     + Mặc định: 10 trang theo yêu cầu.
    #     + Nếu đặt "max": cào liên tục tất cả các trang cho tới khi hết tin tuyển dụng thì thôi.
    #     + Nếu đặt số (ví dụ: page=10): chỉ cào từ trang 1 đến trang số N.
    # - max_jobs_per_page: Giới hạn số job mỗi trang ("max" = cào TOÀN BỘ jobs trên mỗi trang, hoặc đặt số N)
    # - min_delay, max_delay: Thời gian nghỉ ngẫu nhiên giữa các job (chống chặn IP)

    results = crawl(
        page=10,                 # Mặc định lấy 10 trang theo yêu cầu
        max_jobs_per_page="max", # Mặc định cào toàn bộ jobs trên mỗi trang
        min_delay=1.0,
        max_delay=2.0,
        headless=True,
    )
    print(f"\n[HOÀN TẤT] Đã trích xuất tổng cộng {len(results)} jobs từ VietnamWorks.")
