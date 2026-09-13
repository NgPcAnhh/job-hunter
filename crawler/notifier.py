"""
Telegram Notification Module for Job Hunter Pipeline.
Sends rich HTML-formatted notifications for pipeline status, per-spider progress,
and comprehensive sync & deduplication reports.
"""

import os
import time
import logging
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
GITHUB_REPOSITORY = os.getenv("GITHUB_REPOSITORY", "")
GITHUB_RUN_ID = os.getenv("GITHUB_RUN_ID", "")


def is_telegram_configured() -> bool:
    """Checks if Telegram credentials are provided in environment."""
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)


def send_telegram_message(html_text: str, disable_web_page_preview: bool = True) -> bool:
    """Sends an HTML formatted message via Telegram Bot API."""
    if not is_telegram_configured():
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": html_text,
        "parse_mode": "HTML",
        "disable_web_page_preview": disable_web_page_preview
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code == 200:
                logger.info("📱 [Telegram] Gửi thông báo thành công.")
                return True
            else:
                logger.warning(f"⚠️ [Telegram] Gửi thất bại ({resp.status_code}): {resp.text}")
                return False
    except Exception as e:
        logger.warning(f"⚠️ [Telegram] Lỗi kết nối gửi tin nhắn: {e}")
        return False


def get_run_link_html() -> str:
    """Returns a clickable HTML link to the GitHub Actions run if running in CI."""
    if GITHUB_REPOSITORY and GITHUB_RUN_ID:
        run_url = f"https://github.com/{GITHUB_REPOSITORY}/actions/runs/{GITHUB_RUN_ID}"
        return f'\n🔗 <a href="{run_url}">Xem chi tiết GitHub Actions Run</a>'
    return ""


def notify_pipeline_start(sites: List[str], pages: int) -> bool:
    """Sends a notification when the crawler pipeline begins execution."""
    if not is_telegram_configured():
        return False

    sites_str = ", ".join(sites)
    start_time = time.strftime("%Y-%m-%d %H:%M:%S")
    msg = (
        f"🚀 <b>[JOB HUNTER PIPELINE - BẮT ĐẦU]</b>\n"
        f"⏰ <b>Thời gian:</b> <code>{start_time}</code>\n"
        f"🌐 <b>Các trang mục tiêu ({len(sites)}):</b> <code>{sites_str}</code>\n"
        f"📄 <b>Số trang cào mỗi site:</b> <code>{pages}</code>"
        f"{get_run_link_html()}"
    )
    return send_telegram_message(msg)


def notify_site_progress(site_name: str, job_count: int, status: str, duration_s: float) -> bool:
    """Sends progress update after a single spider finishes."""
    if not is_telegram_configured():
        return False

    icon = "✅" if status == "SUCCESS" else "❌"
    msg = (
        f"{icon} <b>Crawl xong:</b> <code>jobs_{site_name}</code>\n"
        f"📦 <b>Số jobs:</b> <b>{job_count}</b> | ⏱️ <code>{duration_s:.1f}s</code>"
    )
    return send_telegram_message(msg)


def notify_pipeline_summary(
    results_summary: Dict[str, Any],
    sync_result: Optional[Dict[str, Any]],
    total_duration_s: float,
    error: Optional[str] = None
) -> bool:
    """
    Sends a comprehensive summary of crawled sites and deduplication/sync metrics.
    """
    if not is_telegram_configured():
        return False

    finish_time = time.strftime("%Y-%m-%d %H:%M:%S")
    status_header = "🎉 <b>[JOB HUNTER - HOÀN TẤT THÀNH CÔNG]</b>" if not error else "⚠️ <b>[JOB HUNTER - CÓ LỖI XẢY RA]</b>"

    lines = [status_header]
    lines.append(f"⏰ <b>Hoàn tất lúc:</b> <code>{finish_time}</code> (⏱️ {total_duration_s:.1f}s)\n")

    # 1. Báo cáo Giai đoạn 1: Thu thập theo trang
    lines.append("📊 <b>1. Dữ liệu thu thập theo từng bảng nguồn:</b>")
    total_crawled = 0
    for site, info in results_summary.items():
        st = info.get("status", "UNKNOWN")
        cnt = info.get("jobs", 0)
        total_crawled += cnt
        icon = "✅" if st == "SUCCESS" else "❌"
        lines.append(f"  • {icon} <code>jobs_{site:<12}</code>: <b>{cnt}</b> jobs")

    lines.append(f"  👉 <i>Tổng jobs vừa cào:</i> <b>{total_crawled}</b> jobs\n")

    # 2. Báo cáo Giai đoạn 2: Khử trùng lặp & Đồng bộ
    if sync_result:
        new_cnt = sync_result.get("new_jobs_inserted", 0)
        dup_cnt = sync_result.get("duplicates_detected", 0)
        total_unified = sync_result.get("total_unified_jobs", 0)

        lines.append("🔄 <b>2. Kết quả Khử trùng lặp & Đồng bộ (≥90%):</b>")
        lines.append(f"  • 🔍 <b>Job mới độc nhất:</b> <b>+{new_cnt}</b> jobs <i>(đã nạp vào kho)</i>")
        lines.append(f"  • ♻️ <b>Job trùng lặp phát hiện:</b> <b>{dup_cnt}</b> jobs <i>(đã lọc bỏ)</i>")
        lines.append(f"  • 🌟 <b>Tổng kho all_jobs_unified:</b> <b>{total_unified}</b> jobs\n")

    if error:
        lines.append(f"⚠️ <b>Lỗi phát sinh:</b> <code>{error}</code>\n")

    lines.append(get_run_link_html())
    full_msg = "\n".join(lines)
    return send_telegram_message(full_msg)
