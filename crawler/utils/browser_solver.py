"""
Browser Solver Module (Playwright + Stealth + Virtual Headful Support)
Tự động giải quyết Cloudflare Turnstile / Managed Challenge trên môi trường Cloud (GitHub Actions IP).
Được thiết kế riêng để dự phòng cho các website tuyển dụng bảo vệ bởi Cloudflare WAF (TopCV, JobsGO).
"""

import os
import platform
import logging
import time
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

HAS_PLAYWRIGHT = False
try:
    from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
    HAS_PLAYWRIGHT = True
except ImportError:
    sync_playwright = None

HAS_STEALTH = False
try:
    from playwright_stealth import Stealth
    HAS_STEALTH = True
except ImportError:
    Stealth = None


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
        import json
        return json.loads(self.text)


class StealthBrowserSolver:
    """
    Quản lý Chromium kèm cơ chế Anti-Detection Stealth để vượt Cloudflare Turnstile.
    Hỗ trợ cả môi trường Headless (Windows/Mac) lẫn Xvfb Virtual Display (Linux/GitHub Actions).
    """

    def __init__(self):
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._stealth = Stealth() if HAS_STEALTH else None
        self.is_linux = platform.system().lower() == "linux"
        # Trên Linux nếu có DISPLAY (từ xvfb-run), chạy headless=False để tránh 100% cờ headless của Cloudflare
        self.has_display = bool(os.getenv("DISPLAY"))
        self.use_headless = not (self.is_linux and self.has_display)

    def _ensure_browser(self):
        if not HAS_PLAYWRIGHT:
            raise RuntimeError("Playwright chưa được cài đặt trong môi trường!")
        if self._playwright is None:
            self._playwright = sync_playwright().start()

        if self._browser is None:
            args = [
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--disable-dev-shm-usage",
                "--window-size=1920,1080",
            ]
            logger.info(
                f"🚀 [Browser Solver] Khởi chạy Chromium (OS: {platform.system()}, Headless: {self.use_headless}, Display: {self.has_display})..."
            )
            self._browser = self._playwright.chromium.launch(
                headless=self.use_headless,
                args=args,
            )

        if self._context is None:
            if self.is_linux:
                ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            else:
                ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

            self._context = self._browser.new_context(
                user_agent=ua,
                viewport={"width": 1920, "height": 1080},
                locale="vi-VN",
                timezone_id="Asia/Ho_Chi_Minh",
            )

    def close(self):
        try:
            if self._context:
                self._context.close()
                self._context = None
            if self._browser:
                self._browser.close()
                self._browser = None
            if self._playwright:
                self._playwright.stop()
                self._playwright = None
        except Exception as e:
            logger.debug(f"Lỗi khi đóng browser solver: {e}")

    def fetch_url(self, url: str, timeout_sec: int = 35) -> Optional[BrowserResponse]:
        """
        Tải URL qua Stealth Chromium. Tự động phát hiện và vượt qua Cloudflare Turnstile.
        """
        if not HAS_PLAYWRIGHT:
            logger.warning("⚠️ Playwright chưa sẵn sàng. Bỏ qua browser solver.")
            return None

        page = None
        try:
            self._ensure_browser()
            page = self._context.new_page()

            if self._stealth:
                self._stealth.apply_stealth_sync(page)

            logger.info(f"🌐 [Stealth Browser] Đang tải URL: {url}")
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_sec * 1000)
            page.wait_for_timeout(2000)

            # Kiểm tra xem có gặp Cloudflare Turnstile Challenge ("Just a moment...") không
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

                logger.info(f"⏳ [Cloudflare Turnstile] Đang xử lý thử thách bảo mật ({attempt + 1}/8)...")

                # Tìm iframe Turnstile và mô phỏng tương tác chuột thực sự
                try:
                    for f in page.frames:
                        if "challenges.cloudflare.com" in f.url:
                            logger.info("🔍 [Turnstile] Phát hiện iframe Cloudflare Challenge...")
                            body = f.locator("body")
                            if body.count() > 0:
                                box = body.bounding_box()
                                if box:
                                    click_x = box["x"] + 30
                                    click_y = box["y"] + box["height"] / 2
                                    page.mouse.click(click_x, click_y)
                                    logger.info(f"👆 [Turnstile] Đã click vào vị trí ({click_x:.1f}, {click_y:.1f})!")
                                    break
                except Exception as click_err:
                    logger.debug(f"Lỗi click iframe: {click_err}")

                page.wait_for_timeout(2000)

            final_title = page.title()
            final_html = page.content()
            cookies = self._context.cookies()

            page.close()
            page = None

            if "just a moment..." in final_title.lower() and len(final_html) < 4000:
                logger.warning(f"🛡️ [Stealth Browser] Cloudflare Turnstile chưa giải quyết được tại {url}.")
                return BrowserResponse(final_html, status_code=403, url=url, cookies=cookies)

            logger.info(f"🎉 [Stealth Browser] Vượt Cloudflare thành công! Tiêu đề: '{final_title[:50]}' (Độ dài: {len(final_html):,} bytes)")
            return BrowserResponse(final_html, status_code=200, url=url, cookies=cookies)

        except Exception as err:
            logger.warning(f"⚠️ [Stealth Browser] Lỗi khi tải URL {url}: {err}")
            if page:
                try:
                    page.close()
                except Exception:
                    pass
            return None


# Global solver instance (lazy loaded)
_global_solver: Optional[StealthBrowserSolver] = None


def fetch_with_stealth_browser(url: str, timeout_sec: int = 35) -> Optional[BrowserResponse]:
    """
    Hàm tiện ích toàn cục để gọi nhanh giải pháp Stealth Browser.
    """
    global _global_solver
    if _global_solver is None:
        _global_solver = StealthBrowserSolver()
    return _global_solver.fetch_url(url, timeout_sec=timeout_sec)


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
    """Giải phóng tài nguyên browser khi hoàn thành phiên crawl."""
    global _global_solver
    if _global_solver is not None:
        _global_solver.close()
        _global_solver = None
