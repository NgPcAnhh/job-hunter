"""
Browser Solver Module (Subprocess-Isolated Playwright + Stealth + Hardware Mouse Turnstile Clicker)
Tự động giải quyết Cloudflare Turnstile / Managed Challenge trên môi trường Cloud (GitHub Actions IP).
Sử dụng kiến trúc Subprocess để cách ly hoàn toàn tiến trình trình duyệt và tránh xung đột luồng.
"""

import os
import sys
import json
import logging
import platform
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


class BrowserResponse:
    """
    Giả lập HTTP Response để tương thích 100% với logic bóc tách BeautifulSoup
    của các spider hiện tại (res.text, res.status_code, res.url, res.headers).
    """
    def __init__(self, text: str, status_code: int = 200, url: str = "", cookies: Optional[List[Dict[str, Any]]] = None):
        self.text = text
        self.status_code = status_code
        self.url = url
        self.headers: Dict[str, str] = {"content-type": "text/html; charset=utf-8"}
        self.cookies = cookies or []

    def json(self) -> Any:
        return json.loads(self.text)


def _worker_fetch(url: str, output_path: str, timeout_sec: int = 40):
    """Thực thi bên trong subprocess độc lập để cách ly Playwright và Greenlet."""
    from playwright.sync_api import sync_playwright

    is_linux = platform.system().lower() == "linux"
    has_display = bool(os.getenv("DISPLAY"))
    # Trên Linux nếu có DISPLAY (từ xvfb-run), chạy headless=False để tránh 100% cờ headless của Cloudflare
    use_headless = not (is_linux and has_display)

    try:
        from playwright_stealth import stealth_sync
        HAS_STEALTH = True
    except ImportError:
        HAS_STEALTH = False

    # Luôn sử dụng User-Agent Windows chuẩn để tránh cờ hệ điều hành máy chủ Linux bị Cloudflare chặn
    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-infobars",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
    ]

    proxy_url = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
    launch_kwargs: Dict[str, Any] = {"headless": use_headless, "args": args}
    if proxy_url:
        launch_kwargs["proxy"] = {"server": proxy_url}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(
                user_agent=ua,
                viewport={"width": 1920, "height": 1080},
                locale="vi-VN",
                timezone_id="Asia/Ho_Chi_Minh",
            )
            page = context.new_page()
            if HAS_STEALTH:
                try:
                    stealth_sync(page)
                except Exception:
                    pass

            page.goto(url, wait_until="domcontentloaded", timeout=timeout_sec * 1000)
            page.wait_for_timeout(2500)

            # Xử lý Cloudflare Turnstile Challenge
            for attempt in range(8):
                title = page.title().lower()
                content_preview = page.content()[:3000].lower()

                is_challenge = (
                    "just a moment..." in title
                    or "cf-turnstile" in content_preview
                    or "cloudflare" in title
                    or "attention required!" in title
                )
                if not is_challenge:
                    break

                # 1. Thử click trực tiếp qua frame locator bên trong Turnstile iframe
                try:
                    for frame in page.frames:
                        if "challenges.cloudflare.com" in frame.url or "turnstile" in frame.url:
                            for sel in ['input[type="checkbox"]', '.ctp-checkbox-label', '#challenge-stage', 'body']:
                                loc = frame.locator(sel)
                                if loc.count() > 0:
                                    loc.first.click(timeout=1500, force=True)
                                    break
                except Exception:
                    pass

                # 2. Thử click theo tọa độ phần cứng của iframe
                try:
                    iframe_elem = page.locator('iframe[src*="challenges.cloudflare.com"], iframe[title*="Cloudflare"], iframe[title*="widget"]')
                    if iframe_elem.count() > 0 and iframe_elem.first.is_visible():
                        box = iframe_elem.first.bounding_box()
                        if box:
                            click_x = box["x"] + min(box["width"] * 0.15, 30)
                            click_y = box["y"] + box["height"] / 2
                            # Di chuyển chuột tự nhiên và click phần cứng
                            page.mouse.move(box["x"] + 5, box["y"] + 5)
                            page.wait_for_timeout(100)
                            page.mouse.move(click_x, click_y)
                            page.wait_for_timeout(100)
                            page.mouse.down()
                            page.wait_for_timeout(100)
                            page.mouse.up()
                except Exception:
                    pass

                page.wait_for_timeout(2000)

            final_title = page.title()
            final_html = page.content()
            cookies = context.cookies()
            browser.close()

            status = 200
            lower_title = final_title.lower()
            if (
                "just a moment..." in lower_title
                or "403" in lower_title
                or "forbidden" in lower_title
                or "access denied" in lower_title
                or "attention required!" in lower_title
                or "cloudflare" in lower_title
            ):
                status = 403
            elif len(final_html) < 2000:
                status = 403

            data = {
                "status": status,
                "title": final_title,
                "html": final_html,
                "cookies": cookies,
                "url": url,
            }
            with open(output_path, "w", encoding="utf-8") as out_f:
                json.dump(data, out_f, ensure_ascii=False)

    except Exception as err:
        try:
            with open(output_path, "w", encoding="utf-8") as out_f:
                json.dump({"status": 500, "error": str(err), "url": url}, out_f)
        except Exception:
            pass


def fetch_with_stealth_browser(url: str, timeout_sec: int = 40) -> Optional[BrowserResponse]:
    """
    Hàm gọi Stealth Browser thông qua Subprocess độc lập:
    - Cách ly 100% Greenlet giữa các luồng trong ThreadPoolExecutor (Tránh triệt để Deadlock).
    - Tự động thu dọn bộ nhớ và tài nguyên khi subprocess kết thúc.
    - Giới hạn cứng thời gian thực thi (Hard Timeout).
    """
    tmp_file = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            tmp_file = f.name

        project_root = Path(__file__).resolve().parent.parent.parent
        env = os.environ.copy()
        env["PYTHONPATH"] = str(project_root)

        cmd = [
            sys.executable,
            "-m",
            "crawler.utils.browser_solver",
            url,
            tmp_file,
            str(timeout_sec),
        ]

        logger.info(f"🌐 [Subprocess Browser] Đang khởi chạy browser độc lập để cào: {url}")
        proc = subprocess.run(
            cmd,
            timeout=timeout_sec + 15,
            capture_output=True,
            text=True,
            cwd=str(project_root),
            env=env,
        )

        if not os.path.exists(tmp_file) or os.path.getsize(tmp_file) == 0:
            logger.warning(f"⚠️ [Subprocess Browser] Subprocess không tạo được dữ liệu đầu ra: {proc.stderr[:300]}")
            return None

        with open(tmp_file, "r", encoding="utf-8") as f:
            result = json.load(f)

        status = result.get("status", 500)
        html = result.get("html", "")
        cookies = result.get("cookies", [])
        title = result.get("title", "")

        if status == 200:
            logger.info(f"🎉 [Subprocess Browser] Vượt Cloudflare thành công! Tiêu đề: '{title[:45]}' ({len(html):,} bytes)")
            return BrowserResponse(html, status_code=200, url=url, cookies=cookies)
        else:
            logger.warning(f"🛡️ [Subprocess Browser] Máy chủ trả về status {status}: {result.get('error', '')}")
            return BrowserResponse(html, status_code=status, url=url, cookies=cookies)

    except subprocess.TimeoutExpired:
        logger.warning(f"⏱️ [Subprocess Browser] Quá thời gian chờ ({timeout_sec}s) khi tải {url}.")
        return None
    except Exception as err:
        logger.warning(f"⚠️ [Subprocess Browser] Lỗi thực thi subprocess: {err}")
        return None
    finally:
        if tmp_file and os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except Exception:
                pass


def sync_cookies_to_session(session: Any, cookies: List[Dict[str, Any]]):
    """Đồng bộ hóa cookie phiên (bao gồm cf_clearance) từ browser sang session curl_cffi / requests."""
    for c in cookies:
        name = c.get("name")
        value = c.get("value")
        domain = c.get("domain", "")
        if name and value:
            try:
                if hasattr(session, "cookies"):
                    if hasattr(session.cookies, "set"):
                        session.cookies.set(name, value, domain=domain)
                    else:
                        session.cookies[name] = value
            except Exception:
                pass


def close_global_solver():
    """Tương thích ngược: giải phóng tài nguyên (Subprocess tự động thu dọn khi thoát)."""
    pass


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        target_url = sys.argv[1]
        out_json = sys.argv[2]
        t_sec = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 40
        _worker_fetch(target_url, out_json, timeout_sec=t_sec)
    else:
        print("Usage: python -m crawler.utils.browser_solver <url> <output_json_path> [timeout_sec]")
