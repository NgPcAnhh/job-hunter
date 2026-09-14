"""
Proxy Pool Helper for Vietnam Crawlers (TopCV, JobsGO).
Resolves working Vietnam proxies via:
1. Explicit parameter / Environment variables (VN_PROXY, TOPCV_PROXY, JOBSGO_PROXY, HTTP_PROXY, HTTPS_PROXY)
2. Fast concurrent auto-discovery from free Vietnam proxy sources if no custom proxy is configured.
"""

import os
import json
import logging
import urllib.request
from typing import Optional, List
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

# Cached working proxy for current execution session
_CACHED_VN_PROXY: Optional[str] = None


def get_configured_vn_proxy(site_name: Optional[str] = None) -> Optional[str]:
    """Kiểm tra proxy cấu hình từ biến môi trường theo độ ưu tiên."""
    if site_name:
        site_proxy = os.getenv(f"{site_name.upper()}_PROXY")
        if site_proxy and site_proxy.strip():
            return site_proxy.strip()

    for key in ["VN_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]:
        val = os.getenv(key)
        if val and val.strip():
            return val.strip()

    return None


def fetch_free_vn_candidates() -> List[str]:
    """Thu thập danh sách proxy Việt Nam từ các nguồn công khai miễn phí."""
    candidates = []

    # Nguồn 1: Geonode
    try:
        url = "https://proxylist.geonode.com/api/proxy-list?country=VN&limit=50&page=1&sort_by=lastChecked&sort_type=desc"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            for item in data.get("data", []):
                ip = item.get("ip")
                port = item.get("port")
                proto = item.get("protocols", ["http"])[0]
                if proto in ["http", "https", "socks5"]:
                    candidates.append(f"{proto}://{ip}:{port}")
    except Exception as e:
        logger.debug(f"Không thể lấy proxy từ Geonode: {e}")

    # Nguồn 2: Proxyscrape
    try:
        url = "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=8000&country=VN&ssl=all&anonymity=all"
        with urllib.request.urlopen(url, timeout=5) as resp:
            lines = resp.read().decode().strip().splitlines()
            for line in lines:
                line = line.strip()
                if line and ":" in line:
                    candidates.append(f"http://{line}")
    except Exception as e:
        logger.debug(f"Không thể lấy proxy từ Proxyscrape: {e}")

    return list(dict.fromkeys(candidates))


def test_single_proxy(proxy_url: str, timeout: float = 4.0) -> Optional[str]:
    """Kiểm tra xem proxy có thực sự kết nối được không."""
    try:
        from curl_cffi import requests
        s = requests.Session(impersonate="chrome120", proxies={"http": proxy_url, "https": proxy_url})
        r = s.get("https://api.ipify.org?format=json", timeout=timeout)
        if r.status_code == 200:
            return proxy_url
    except Exception:
        pass
    return None


def find_working_free_vn_proxy(max_test: int = 25, timeout: float = 3.5) -> Optional[str]:
    """Tự động kiểm tra nhanh các proxy Việt Nam miễn phí để tìm 1 proxy còn sống."""
    global _CACHED_VN_PROXY
    if _CACHED_VN_PROXY:
        return _CACHED_VN_PROXY

    candidates = fetch_free_vn_candidates()
    if not candidates:
        return None

    test_pool = candidates[:max_test]
    logger.info(f"🔍 Đang tự động quét nhanh {len(test_pool)} proxy Việt Nam miễn phí...")

    with ThreadPoolExecutor(max_workers=15) as executor:
        futures = [executor.submit(test_single_proxy, p, timeout) for p in test_pool]
        for f in as_completed(futures):
            res = f.result()
            if res:
                logger.info(f"✅ Tìm thấy Proxy Việt Nam hoạt động: {res}")
                _CACHED_VN_PROXY = res
                return res

    logger.warning("⚠️ Không tìm thấy proxy Việt Nam miễn phí nào phản hồi trong ngưỡng timeout.")
    return None


def resolve_vn_proxy(site_name: Optional[str] = None, explicit_proxy: Optional[str] = None) -> Optional[str]:
    """
    Hàm giải quyết proxy chính:
    1. Ưu tiên proxy truyền trực tiếp hoặc từ biến môi trường (Secrets / ENV)
    2. Nếu không có, tự động quét tìm proxy Việt Nam miễn phí
    """
    if explicit_proxy and explicit_proxy.strip():
        return explicit_proxy.strip()

    cfg = get_configured_vn_proxy(site_name)
    if cfg:
        logger.info(f"🌐 [{site_name or 'VN'}] Sử dụng Proxy cấu hình từ môi trường: {cfg}")
        return cfg

    # Tự động tìm proxy VN miễn phí
    free_proxy = find_working_free_vn_proxy()
    if free_proxy:
        return free_proxy

    return None
