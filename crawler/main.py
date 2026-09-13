"""
Main Entrypoint for Crawler Pipeline.
Invoked by GitHub Actions Cronjob or local development.
1. Iterates through all registered job crawlers and saves raw records into per-source tables (`jobs_<source>`).
2. Calls `sync_unified` module to deduplicate (similarity >= 90%) and sync unique jobs into `all_jobs_unified`.
"""

import sys
import argparse
import logging
from pathlib import Path

# Đảm bảo import được các module crawler và db
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from crawler.db import ensure_table_exists, get_db_connection
from crawler.sync_unified import sync_all_sources_to_unified

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def run_pipeline(sites=None, pages=2, max_jobs_per_page="max", dedup_threshold=0.90, skip_sync=False):
    """
    Chạy tuần tự các crawler lưu vào bảng riêng (`jobs_<source>`), sau đó đồng bộ khử trùng vào `all_jobs_unified`.
    """
    logger.info("=" * 60)
    logger.info("🚀 KHỞI ĐỘNG PIPELINE CRAWLER VIỆC LÀM (MULTI-SOURCE -> UNIFIED)")
    logger.info("=" * 60)

    # 1. Kiểm tra / Khởi tạo bảng tổng Supabase
    try:
        ensure_table_exists("all_jobs_unified")
    except Exception as e:
        logger.error(f"❌ Không thể kết nối hoặc khởi tạo bảng trên Supabase: {e}")
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
    }

    targets = sites if sites else list(registered_spiders.keys())
    results_summary = {}

    for site_name in targets:
        if site_name not in registered_spiders:
            logger.warning(f"⚠️ Không tìm thấy spider: {site_name}. Bỏ qua.")
            continue

        mod_path, func_name = registered_spiders[site_name]
        logger.info(f"\n--- [BƯỚC 1: CRAWL {site_name.upper()} -> BẢNG jobs_{site_name}] ---")

        try:
            mod = __import__(mod_path, fromlist=[func_name])
            crawl_func = getattr(mod, func_name)

            # Thực hiện crawl và tự động lưu vào bảng riêng jobs_<source>
            crawled = crawl_func(page=pages, max_jobs_per_page=max_jobs_per_page)
            job_count = len(crawled) if crawled else 0
            results_summary[site_name] = {"status": "SUCCESS", "jobs": job_count}
            logger.info(f"✅ Hoàn tất crawl {site_name}: {job_count} jobs vào `jobs_{site_name}`.")
        except Exception as e:
            logger.error(f"❌ Thất bại khi cào {site_name}: {e}")
            results_summary[site_name] = {"status": "FAILED", "error": str(e), "jobs": 0}

    # 3. Báo cáo giai đoạn crawl
    logger.info("\n" + "=" * 60)
    logger.info("📊 KẾT QUẢ GIAI ĐOẠN 1 (CRAWL VÀO BẢNG RIÊNG)")
    logger.info("=" * 60)
    total_crawled = 0
    for site, info in results_summary.items():
        st = info["status"]
        cnt = info.get("jobs", 0)
        total_crawled += cnt
        logger.info(f"  • jobs_{site:<12}: {st:<8} ({cnt} jobs)")

    # 4. Giai đoạn đồng bộ & khử trùng lặp sang all_jobs_unified
    if not skip_sync:
        logger.info("\n--- [BƯỚC 2: ĐỒNG BỘ & KHỬ TRÙNG LẶP SANG all_jobs_unified] ---")
        sync_all_sources_to_unified(sources=targets, threshold=dedup_threshold)
    else:
        logger.info("Bỏ qua bước đồng bộ (--skip-sync được kích hoạt).")

    # 5. Thống kê tổng hợp trên database
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

    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Job Hunter Crawler & Sync Pipeline")
    parser.add_argument("--site", type=str, default=None, help="Tên spider cần chạy (mặc định: toàn bộ)")
    parser.add_argument("--pages", type=int, default=2, help="Số trang mỗi site (mặc định: 2)")
    parser.add_argument("--jobs-per-page", default="max", help="Số job mỗi trang (mặc định: 'max')")
    parser.add_argument("--dedup-threshold", type=float, default=0.90, help="Ngưỡng so sánh tương đồng (mặc định: 0.90)")
    parser.add_argument("--skip-sync", action="store_true", help="Chỉ cào vào bảng riêng, không đồng bộ sang bảng tổng")

    args = parser.parse_args()
    selected_sites = [s.strip() for s in args.site.split(",")] if args.site else None

    run_pipeline(
        sites=selected_sites,
        pages=args.pages,
        max_jobs_per_page=args.jobs_per_page,
        dedup_threshold=args.dedup_threshold,
        skip_sync=args.skip_sync
    )


if __name__ == "__main__":
    main()
