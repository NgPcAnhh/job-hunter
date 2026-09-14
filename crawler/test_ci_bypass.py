"""
Experimental Cloudflare Bypass Tester for TopCV and JobsGO on GitHub Actions IP.
Runs multiple bypass techniques and reports the exact response, status, and headers.
"""

import sys
import logging
from curl_cffi import requests as curl_requests
import cloudscraper

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cf_tester")

TOPCV_URLS = [
    "https://www.topcv.vn/tim-viec-lam-cong-nghe-thong-tin-cr257?page=1",
    "https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026?page=1",
    "https://www.topcv.vn/tim-viec-lam-it?page=1",
    "https://www.topcv.vn/sitemap/jobs_0.xml",
]

JOBSGO_URLS = [
    "https://jobsgo.vn/nganh-nghe.html?slug=viec-lam-cong-nghe-thong-tin&page=1",
    "https://jobsgo.vn/viec-lam-cong-nghe-thong-tin.html",
    "https://jobsgo.vn/sitemap-job.xml",
]

def check_response(label, res):
    if res is None:
        logger.warning(f"[{label}] None response")
        return
    text = getattr(res, "text", "")[:300].replace("\n", " ")
    title = ""
    if "<title>" in text.lower():
        start = text.lower().find("<title>") + 7
        end = text.lower().find("</title>", start)
        title = text[start:end].strip()
    
    server = res.headers.get("server", "unknown")
    cf_ray = res.headers.get("cf-ray", "none")
    logger.info(f"[{label}] Status: {res.status_code} | Len: {len(text)} | Server: {server} | Ray: {cf_ray} | Title: '{title}'")


def run_tests():
    logger.info("==================================================")
    logger.info("🔬 BẮT ĐẦU THỬ NGHIỆM BYPASS CLOUDFLARE CHO TOPCV & JOBSGO")
    logger.info("==================================================")

    # 1. Thử curl_cffi với các impersonation khác nhau
    impersonations = ["chrome120", "chrome124", "safari15_5", "safari17_0", "edge101"]
    
    for imp in impersonations:
        logger.info(f"\n--- [1. curl_cffi impersonate='{imp}'] ---")
        s = curl_requests.Session(impersonate=imp)
        for u in [TOPCV_URLS[0], JOBSGO_URLS[0]]:
            site = "TopCV" if "topcv" in u else "JobsGO"
            try:
                r = s.get(u, timeout=10)
                check_response(f"{site} - {imp}", r)
            except Exception as e:
                logger.warning(f"[{site} - {imp}] Error: {e}")

    # 2. Thử cloudscraper
    logger.info("\n--- [2. cloudscraper] ---")
    try:
        scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
        for u in [TOPCV_URLS[0], JOBSGO_URLS[0]]:
            site = "TopCV" if "topcv" in u else "JobsGO"
            try:
                r = scraper.get(u, timeout=10)
                check_response(f"{site} - cloudscraper", r)
            except Exception as e:
                logger.warning(f"[{site} - cloudscraper] Error: {e}")
    except Exception as e:
        logger.warning(f"cloudscraper initialization error: {e}")

    # 3. Thử các URL danh mục khác nhau của TopCV và JobsGO
    logger.info("\n--- [3. Thử các URL danh mục khác nhau] ---")
    s = curl_requests.Session(impersonate="chrome120")
    for u in TOPCV_URLS:
        try:
            r = s.get(u, timeout=10)
            check_response(f"TopCV ({u})", r)
        except Exception as e:
            logger.warning(f"TopCV ({u}) Error: {e}")

    for u in JOBSGO_URLS:
        try:
            r = s.get(u, timeout=10)
            check_response(f"JobsGO ({u})", r)
        except Exception as e:
            logger.warning(f"JobsGO ({u}) Error: {e}")

if __name__ == "__main__":
    run_tests()
