"""
Main Entrypoint for Crawler Pipeline.
Invoked by GitHub Actions Cronjob or local development.
1. Concurrently runs job crawlers (default: 2 workers in parallel) and saves raw records into per-source tables (`jobs_<source>`).
2. Calls `sync_unified` module to deduplicate (similarity >= 90%) and sync unique jobs into `all_jobs_unified`.
3. Sends detailed real-time progress and summary reports to Telegram.
"""

import sys
import time
import argparse
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Đảm bảo import được các module crawler và db
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from crawler.db import ensure_table_exists, get_db_connection
from crawler.sync_unified import sync_all_sources_to_unified
from crawler.notifier import (
    notify_pipeline_start,
    notify_site_progress,
    notify_pipeline_summary,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def crawl_single_spider(site_name: str, mod_path: str, func_name: str, pages: int, max_jobs_per_page: str):
    """
    Worker thực thi cào dữ liệu cho một spider cụ thể trong một luồng độc lập.
    """
    logger.info(f"\n--- [BƯỚC 1: BẮT ĐẦU CRAWL {site_name.upper()} -> BẢNG jobs_{site_name}] ---")
    site_start_time = time.time()

    try:
        mod = __import__(mod_path, fromlist=[func_name])
        crawl_func = getattr(mod, func_name)

        # Thực hiện crawl và tự động lưu vào bảng riêng jobs_<source>
        crawled = crawl_func(page=pages, max_jobs_per_page=max_jobs_per_page)
        job_count = len(crawled) if crawled else 0
        duration = time.time() - site_start_time
        logger.info(f"✅ Hoàn tất crawl {site_name}: {job_count} jobs vào `jobs_{site_name}` ({duration:.1f}s).")
        
        # Gửi thông báo tiến trình hoàn tất từng trang qua Telegram
        notify_site_progress(site_name, job_count, "SUCCESS", duration)
        return site_name, {"status": "SUCCESS", "jobs": job_count, "duration": duration}
    except Exception as e:
        duration = time.time() - site_start_time
        logger.error(f"❌ Thất bại khi cào {site_name}: {e}")
        notify_site_progress(site_name, 0, "FAILED", duration)
        return site_name, {"status": "FAILED", "error": str(e), "jobs": 0, "duration": duration}
    finally:
        # Giải phóng bộ nhớ RAM triệt để sau khi mỗi spider hoàn thành (đặc biệt là Playwright/Chromium)
        import gc
        gc.collect()


def run_pipeline(
    sites=None,
    pages=10,
    max_jobs_per_page="max",
    dedup_threshold=0.90,
    skip_sync=False,
    max_workers=3
):
    """
    Chạy song song (mặc định 3 workers) các crawler lưu vào bảng riêng (`jobs_<source>`),
    sau đó đồng bộ khử trùng lặp vào `all_jobs_unified`.
    """
    start_time_all = time.time()
    logger.info("=" * 60)
    logger.info(f"🚀 KHỞI ĐỘNG PIPELINE CRAWLER VIỆC LÀM (CHẠY SONG SONG: {max_workers} LUỒNG)")
    logger.info("=" * 60)

    # 1. Kiểm tra / Khởi tạo bảng tổng Supabase
    try:
        ensure_table_exists("all_jobs_unified")
    except Exception as e:
        logger.error(f"❌ Không thể kết nối hoặc khởi tạo bảng trên Supabase: {e}")
        notify_pipeline_summary({}, None, time.time() - start_time_all, error=f"Khởi tạo bảng Supabase thất bại: {e}")
        return

    # 2. Danh sách các spider đã chuẩn hóa
    registered_spiders = {
        "careerlink": ("crawler.crawl.careerlink", "crawl"),
        "careerviet": ("crawler.crawl.careerviet", "crawl"),
        "topcv": ("crawler.crawl.topcv", "crawl"),
        "vieclam24h": ("crawler.crawl.vieclam24h", "crawl"),
        "jobsgo": ("crawler.crawl.jobsgo", "crawl"),
        "joboko": ("crawler.crawl.joboko", "crawl"),
        "vietnamworks": ("crawler.crawl.vietnamworks", "crawl"),
        "job123": ("crawler.crawl.job123", "crawl"),
        "123job": ("crawler.crawl.job123", "crawl"),
        "timviec365": ("crawler.crawl.365timviec", "crawl"),
        "365timviec": ("crawler.crawl.365timviec", "crawl"),
        "topdev": ("crawler.crawl.topdev", "crawl"),
    }

    canonical_all_sites = [
        "vietnamworks",
        "vieclam24h",
        "careerlink",
        "careerviet",
        "joboko",
        "job123",
        "timviec365",
        "topdev",
        "topcv",
        "jobsgo",
    ]

    targets = sites if sites else canonical_all_sites
    valid_spiders = [(s, registered_spiders[s]) for s in targets if s in registered_spiders]
    results_summary = {}

    # Gửi thông báo bắt đầu qua Telegram
    notify_pipeline_start(targets, pages)

    # 3. Giai đoạn 1: Chạy song song (Parallel execution với ThreadPoolExecutor)
    logger.info(f"⚡ Bắt đầu cào đồng thời {len(valid_spiders)} website với {max_workers} workers song song...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_site = {
            executor.submit(
                crawl_single_spider,
                site_name,
                mod_path,
                func_name,
                pages,
                max_jobs_per_page
            ): site_name
            for site_name, (mod_path, func_name) in valid_spiders
        }

        for future in as_completed(future_to_site):
            site_name, result = future.result()
            results_summary[site_name] = result

    # 4. Báo cáo giai đoạn crawl
    logger.info("\n" + "=" * 60)
    logger.info("📊 KẾT QUẢ GIAI ĐOẠN 1 (CRAWL VÀO BẢNG RIÊNG)")
    logger.info("=" * 60)
    total_crawled = 0
    for site, info in results_summary.items():
        st = info["status"]
        cnt = info.get("jobs", 0)
        dur = info.get("duration", 0.0)
        total_crawled += cnt
        logger.info(f"  • jobs_{site:<12}: {st:<8} ({cnt} jobs | {dur:.1f}s)")

    # 5. Giai đoạn 2: Đồng bộ & khử trùng lặp sang all_jobs_unified
    sync_result = None
    if not skip_sync:
        logger.info("\n--- [BƯỚC 2: ĐỒNG BỘ & KHỬ TRÙNG LẶP SANG all_jobs_unified] ---")
        try:
            sync_result = sync_all_sources_to_unified(sources=targets, threshold=dedup_threshold)
        except Exception as err:
            logger.error(f"❌ Lỗi trong quá trình đồng bộ: {err}")
    else:
        logger.info("Bỏ qua bước đồng bộ (--skip-sync được kích hoạt).")

    # 6. Thống kê tổng hợp trên database
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*), source FROM all_jobs_unified GROUP BY source;")
                rows = cur.fetchall()
                logger.info("\nThống kê dữ liệu hiện có trong bảng tổng `all_jobs_unified`:")
                for r in rows:
                    logger.info(f"  - Source {r[1]}: {r[0]} bản ghi")
    except Exception as e:
        logger.debug(f"Không thể truy vấn thống kê: {e}")

    total_duration = time.time() - start_time_all
    logger.info(f"\n⏱️ Tổng thời gian thực thi: {total_duration:.1f} giây.")
    logger.info("=" * 60)

    # Gửi báo cáo tổng kết chi tiết đến Telegram
    notify_pipeline_summary(results_summary, sync_result, total_duration)


def main():
    parser = argparse.ArgumentParser(description="Job Hunter Crawler & Sync Pipeline with Parallel Workers & Telegram")
    parser.add_argument("--site", type=str, default=None, help="Tên spider cần chạy (mặc định: toàn bộ)")
    parser.add_argument("--pages", type=int, default=10, help="Số trang mỗi site (mặc định: 10)")
    parser.add_argument("--jobs-per-page", default="max", help="Số job mỗi trang (mặc định: 'max')")
    parser.add_argument("--dedup-threshold", type=float, default=0.90, help="Ngưỡng so sánh tương đồng (mặc định: 0.90)")
    parser.add_argument("--workers", type=int, default=3, help="Số luồng chạy song song an toàn cho hạ tầng (mặc định: 3)")
    parser.add_argument("--skip-sync", action="store_true", help="Chỉ cào vào bảng riêng, không đồng bộ sang bảng tổng")

    args = parser.parse_args()
    selected_sites = [s.strip() for s in args.site.split(",")] if args.site else None

    run_pipeline(
        sites=selected_sites,
        pages=args.pages,
        max_jobs_per_page=args.jobs_per_page,
        dedup_threshold=args.dedup_threshold,
        skip_sync=args.skip_sync,
        max_workers=args.workers
    )


if __name__ == "__main__":
    main()
