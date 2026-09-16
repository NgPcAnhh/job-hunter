#!/usr/bin/env python3
"""
Script Chạy Local Job Crawler Riêng Cho Máy Cá Nhân.
- Tự động nạp biến môi trường DATABASE_URL từ frontend/.env.local (Không cần gán thủ công)
- Mặc định cào 4 trang Việt Nam: TopCV, JobsGO, TimViec365, Vieclam24h (10 trang/site, cào hết job/trang)
- Tự động khử trùng lặp và tính toán lại Ma trận Lương & Analytics (Gold Metrics)

Cách sử dụng đơn giản:
  python run_local_crawler.py
  python run_local_crawler.py --pages 5
  python run_local_crawler.py --sites topcv,jobsgo --pages 10
"""

import os
import sys
import time
import argparse
import logging
from pathlib import Path

# Đảm bảo mã hóa UTF-8 chuẩn trên Windows Console
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# 1. Tự động nạp biến môi trường từ frontend/.env.local
def load_local_env():
    env_path = ROOT_DIR / "frontend" / ".env.local"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'").strip('"')
                    if k not in os.environ:
                        os.environ[k] = v

load_local_env()

# Nạp pipeline runner và gold aggregator
from crawler.main import run_pipeline
from crawler.aggregate_gold_metrics import run_all_aggregations

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("LocalCrawlerRunner")


def main():
    parser = argparse.ArgumentParser(description="Tool cào tuyển dụng Local cho máy cá nhân (Vietnam IP)")
    parser.add_argument(
        "--sites",
        type=str,
        default="topcv,jobsgo,timviec365,vieclam24h",
        help="Danh sách trang muốn cào (cách nhau bởi dấu phẩy, mặc định: topcv,jobsgo,timviec365,vieclam24h)"
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=10,
        help="Số lượng trang mỗi site (mặc định: 10 trang)"
    )
    parser.add_argument(
        "--jobs-per-page",
        type=str,
        default="max",
        help="Số job mỗi trang (mặc định: 'max' để cào toàn bộ job)"
    )
    parser.add_argument(
        "--dedup-threshold",
        type=float,
        default=0.90,
        help="Ngưỡng khử trùng lặp (mặc định: 0.90)"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=2,
        help="Số luồng cào song song (mặc định: 2)"
    )
    parser.add_argument(
        "--skip-gold",
        action="store_true",
        help="Bỏ qua bước tính toán lại Gold Metrics"
    )

    args = parser.parse_args()

    target_sites = [s.strip().lower() for s in args.sites.split(",") if s.strip()]

    print("=" * 70)
    print("🚀 CHẠY JOB CRAWLER LOCAL DÀNH CHO MÁY CÁ NHÂN (VIỆT NAM IP)")
    print("=" * 70)
    print(f"📌 Danh sách các trang: {', '.join(target_sites)}")
    print(f"📄 Số trang mỗi site  : {args.pages} trang")
    print(f"📑 Số job / trang     : {args.jobs_per_page}")
    print(f"🧵 Số luồng song song  : {args.workers}")
    print("=" * 70)

    start_time_all = time.time()

    # 1. Chạy cào dữ liệu và đồng bộ vào all_jobs_unified
    run_pipeline(
        sites=target_sites,
        pages=args.pages,
        max_jobs_per_page=args.jobs_per_page,
        dedup_threshold=args.dedup_threshold,
        max_workers=args.workers,
    )

    # 2. Tính toán lại Gold Metrics (Ma trận Lương & Analytics)
    if not args.skip_gold:
        logger.info("\n--- [BƯỚC CUỐI: TÍNH TOÁN LẠI GOLD METRICS & BẢNG LƯƠNG] ---")
        try:
            run_all_aggregations()
            logger.info("✅ Cập nhật bảng Gold Metrics & Bảng Lương thành công!")
        except Exception as e:
            logger.error(f"❌ Lỗi khi cập nhật Gold Metrics: {e}")

    total_duration = time.time() - start_time_all
    logger.info("\n" + "=" * 70)
    logger.info(f"🎉 HOÀN THÀNH TOÀN BỘ JOB LOCAL SAU {total_duration:.1f} GIÂY")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
