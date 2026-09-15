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
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def get_telegram_token() -> str:
    return os.getenv("TELEGRAM_BOT_TOKEN", "").strip()


def get_telegram_chat_id() -> str:
    return os.getenv("TELEGRAM_CHAT_ID", "").strip()


def is_telegram_configured() -> bool:
    """Checks if Telegram credentials are provided in environment."""
    return bool(get_telegram_token() and get_telegram_chat_id())


def send_telegram_message(html_text: str, disable_web_page_preview: bool = True) -> bool:
    """Sends an HTML formatted message via Telegram Bot API."""
    token = get_telegram_token()
    chat_id = get_telegram_chat_id()
    if not (token and chat_id):
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
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
    repo = os.getenv("GITHUB_REPOSITORY", "").strip()
    run_id = os.getenv("GITHUB_RUN_ID", "").strip()
    if repo and run_id:
        run_url = f"https://github.com/{repo}/actions/runs/{run_id}"
        return f'\n🔗 <a href="{run_url}"><b>Xem chi tiết GitHub Actions Run #{run_id}</b></a>'
    return ""


def notify_pipeline_start(sites: List[str], pages: int) -> bool:
    """No-op: Chế độ thông báo duy nhất đã được kích hoạt, chỉ gửi 1 tin tổng kết cuối cùng."""
    return True


def notify_site_progress(site_name: str, job_count: int, status: str, duration_s: float) -> bool:
    """No-op: Chế độ thông báo duy nhất đã được kích hoạt, chỉ gửi 1 tin tổng kết cuối cùng."""
    return True


def notify_pipeline_summary(
    results_summary: Dict[str, Any],
    sync_result: Optional[Dict[str, Any]],
    total_duration_s: float,
    error: Optional[str] = None
) -> bool:
    """
    Gửi DUY NHẤT 1 bản báo cáo tổng kết hoàn chỉnh và giàu thông tin qua Telegram:
    - Thời gian chạy job (Giờ Việt Nam UTC+7) & Tổng thời lượng
    - Quá trình xử lý & Kết quả thu thập từng bảng nguồn
    - Kết quả đồng bộ & Khử trùng lặp sang all_jobs_unified
    - Phần chẩn đoán ngắn gọn cho các task về 0 jobs hoặc gặp lỗi
    """
    import html as html_lib
    import datetime

    if not is_telegram_configured():
        return False

    # 1. Tính thời gian hoàn tất theo giờ Việt Nam (UTC+7)
    utc_now = datetime.datetime.utcnow()
    vn_now = utc_now + datetime.timedelta(hours=7)
    finish_time_str = vn_now.strftime("%d/%m/%Y %H:%M:%S")

    wf_name = os.getenv("GITHUB_WORKFLOW") or ("Local Runner" if os.name == "nt" else "Job Hunter Pipeline")
    status_header = "🎉 <b>[JOB HUNTER - HOÀN TẤT TỔNG KẾT]</b>" if not error else "⚠️ <b>[JOB HUNTER - BÁO CÁO CÓ LỖI]</b>"

    lines = [status_header]
    lines.append(f"🏷️ <b>Workflow:</b> <code>{html_lib.escape(wf_name)}</code>")
    lines.append(f"⏰ <b>Thời gian (VN):</b> <code>{finish_time_str}</code> (⏱️ <b>{total_duration_s:.1f}s</b>)\n")

    # 2. Báo cáo Giai đoạn 1: Quá trình & Kết quả Cào dữ liệu theo từng website
    lines.append("📊 <b>1. Quá trình cào theo từng bảng nguồn:</b>")
    total_crawled = 0
    zero_or_failed_jobs = []

    for site, info in results_summary.items():
        st = info.get("status", "UNKNOWN")
        cnt = info.get("jobs", 0)
        dur = info.get("duration", 0.0)
        err_msg = info.get("error") or info.get("message") or ""
        total_crawled += cnt

        if cnt > 0:
            icon = "✅"
            lines.append(f"  • {icon} <code>jobs_{site:<12}</code>: <b>{cnt}</b> jobs (⏱️ <code>{dur:.1f}s</code>)")
        else:
            icon = "⚠️"
            lines.append(f"  • {icon} <code>jobs_{site:<12}</code>: <b>0</b> jobs (⏱️ <code>{dur:.1f}s</code>)")
            zero_or_failed_jobs.append((site, err_msg if err_msg else "Không bóc tách được tin mới / WAF hoặc trang trống"))

    lines.append(f"  👉 <b>Tổng số jobs thu thập:</b> <b>{total_crawled}</b> jobs\n")

    # 3. Báo cáo Giai đoạn 2: Khử trùng lặp & Đồng bộ vào all_jobs_unified
    if sync_result:
        new_cnt = sync_result.get("new_jobs_inserted", 0)
        dup_cnt = sync_result.get("duplicates_detected", 0)
        total_unified = sync_result.get("total_unified_jobs", 0)

        lines.append("🔄 <b>2. Kết quả Khử trùng lặp & Đồng bộ (≥90%):</b>")
        lines.append(f"  • 🔍 <b>Job mới độc nhất:</b> <b>+{new_cnt}</b> jobs <i>(đã nạp vào kho tổng)</i>")
        lines.append(f"  • ♻️ <b>Job trùng lặp lọc bỏ:</b> <b>{dup_cnt}</b> jobs")
        lines.append(f"  • 🌟 <b>Tổng kho all_jobs_unified:</b> <b>{total_unified:,}</b> jobs\n")

    # 4. Báo cáo Giai đoạn 3: Chi tiết ngắn gọn cho các task về 0 jobs hoặc gặp sự cố
    if zero_or_failed_jobs:
        lines.append("⚠️ <b>3. Chẩn đoán task thu thập 0 jobs / Cảnh báo:</b>")
        for site, reason in zero_or_failed_jobs:
            clean_reason = html_lib.escape(str(reason))[:120]
            lines.append(f"  • <b>{site}:</b> <i>{clean_reason}</i>")
        lines.append("")

    if error:
        lines.append(f"❌ <b>Lỗi hệ thống:</b> <code>{html_lib.escape(str(error))}</code>\n")

    lines.append(get_run_link_html())
    full_msg = "\n".join(lines)
    return send_telegram_message(full_msg)
