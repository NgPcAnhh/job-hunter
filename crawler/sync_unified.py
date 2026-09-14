"""
Deduplication and Synchronization Module for Job Hunter.
Synchronizes jobs from individual source tables (`jobs_<source>`) into the unified table `all_jobs_unified`.
Applies fuzzy similarity matching (Threshold >= 90%) on:
1. Company Name >= 90%
2. Job Title >= 90%
3. Salary OR Level >= 90%
Duplicates are filtered out so that only unique jobs are upserted into `all_jobs_unified`,
while duplicate source URLs are linked into `extra_info->'duplicate_sources'`.
"""

import re
import sys
import json
import difflib
import logging
import argparse
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values, Json

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from crawler.db import (
    get_db_connection,
    ensure_table_exists,
    sanitize_table_name,
    standardize_job_dict,
    get_upsert_jobs_sql,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

ALL_SOURCES = [
    "careerlink",
    "careerviet",
    "topcv",
    "vieclam24h",
    "vietnamworks",
    "jobsgo",
    "joboko",
]


def normalize_text(text: Optional[str]) -> str:
    """Normalize text by converting to lowercase, removing company legal entities & punctuation."""
    if not text:
        return ""
    t = text.lower().strip()
    # Strip common Vietnamese and English corporate legal structure prefixes/suffixes
    t = re.sub(
        r"\b(công ty tnhh mtv|công ty tnhh|công ty cổ phần|công ty cp|công ty|cty tnhh|cty cp|cty|tnhh|co\.,\s*ltd|ltd|corp|corporation|group|jsc|chi nhánh|ngân hàng tmcp|ngân hàng)\b",
        " ",
        t,
    )
    # Remove punctuation & symbols
    t = re.sub(r"[^\w\s]", " ", t)
    return " ".join(t.split())


def calculate_similarity(s1: Optional[str], s2: Optional[str]) -> float:
    """
    Computes fuzzy similarity ratio between two strings [0.0, 1.0].
    Combines character SequenceMatcher with word token Jaccard overlap.
    """
    n1 = normalize_text(s1)
    n2 = normalize_text(s2)

    if not n1 and not n2:
        return 1.0
    if not n1 or not n2:
        return 0.0
    if n1 == n2:
        return 1.0

    # 1. SequenceMatcher character-level ratio
    seq_ratio = difflib.SequenceMatcher(None, n1, n2).ratio()

    # 2. Token overlap ratio (handles word reordering)
    tokens1 = set(n1.split())
    tokens2 = set(n2.split())
    if tokens1 and tokens2:
        token_overlap = len(tokens1 & tokens2) / len(tokens1 | tokens2)
        return max(seq_ratio, token_overlap)

    return seq_ratio


def is_negotiable_or_empty(text: Optional[str]) -> bool:
    """Check if salary or level string represents negotiable / unstated."""
    if not text:
        return True
    clean = text.lower().strip()
    return clean in ["", "thương lượng", "thỏa thuận", "thoa thuan", "thuong luong", "negotiable", "cạnh tranh"]


def is_duplicate_job(
    incoming: Dict[str, Any],
    candidate: Dict[str, Any],
    threshold: float = 0.90
) -> Tuple[bool, Dict[str, float]]:
    """
    Evaluates whether `incoming` job is a duplicate of `candidate` job.
    Criteria:
      1. Company similarity >= threshold (0.90)
      2. Title similarity >= threshold (0.90)
      3. Salary similarity >= threshold (0.90) OR Level similarity >= threshold (0.90)
    """
    # 1. Compare company name
    comp_sim = calculate_similarity(incoming.get("company_name"), candidate.get("company_name"))
    if comp_sim < threshold:
        return False, {"company": comp_sim, "title": 0.0, "salary": 0.0, "level": 0.0}

    # 2. Compare job title
    title_sim = calculate_similarity(incoming.get("job_title"), candidate.get("job_title"))
    if title_sim < threshold:
        return False, {"company": comp_sim, "title": title_sim, "salary": 0.0, "level": 0.0}

    # 3. Compare salary OR level
    inc_salary = incoming.get("salary")
    cand_salary = candidate.get("salary")
    inc_level = incoming.get("level")
    cand_level = candidate.get("level")

    # Salary comparison
    if is_negotiable_or_empty(inc_salary) and is_negotiable_or_empty(cand_salary):
        salary_sim = 1.0
    elif is_negotiable_or_empty(inc_salary) or is_negotiable_or_empty(cand_salary):
        salary_sim = 0.5  # Partial match when one is unstated
    else:
        salary_sim = calculate_similarity(inc_salary, cand_salary)

    # Level comparison
    if is_negotiable_or_empty(inc_level) and is_negotiable_or_empty(cand_level):
        level_sim = 1.0
    elif is_negotiable_or_empty(inc_level) or is_negotiable_or_empty(cand_level):
        level_sim = 0.5  # Partial match when one is unstated
    else:
        level_sim = calculate_similarity(inc_level, cand_level)

    # Condition 3: salary >= threshold OR level >= threshold
    salary_or_level_matched = (salary_sim >= threshold) or (level_sim >= threshold)

    scores = {
        "company": comp_sim,
        "title": title_sim,
        "salary": salary_sim,
        "level": level_sim
    }

    is_dup = salary_or_level_matched
    return is_dup, scores


def fetch_table_jobs(table_name: str) -> List[Dict[str, Any]]:
    """Fetch all rows from given table as dicts."""
    clean_name = sanitize_table_name(table_name)
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Check if table exists first
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = %s
                    );
                """, (clean_name,))
                if not cur.fetchone()["exists"]:
                    return []

                cur.execute(f"SELECT * FROM {clean_name};")
                rows = cur.fetchall()
                return [dict(r) for r in rows]
    except Exception as e:
        logger.warning(f"Could not read from `{clean_name}`: {e}")
        return []


def sync_all_sources_to_unified(
    sources: Optional[List[str]] = None,
    threshold: float = 0.90
) -> Dict[str, Any]:
    """
    Reads all source tables `jobs_<source>`, compares records against `all_jobs_unified`,
    and inserts non-duplicate jobs while tagging duplicates.
    """
    logger.info("=" * 60)
    logger.info(f"🔄 BẮT ĐẦU ĐỒNG BỘ & KHỬ TRÙNG LẶP (NGƯỠNG: {threshold * 100:.0f}%)")
    logger.info("=" * 60)

    target_sources = sources if sources else ALL_SOURCES
    ensure_table_exists("all_jobs_unified")

    # 1. Tải toàn bộ dữ liệu hiện có trong all_jobs_unified
    unified_jobs: List[Dict[str, Any]] = fetch_table_jobs("all_jobs_unified")
    logger.info(f"Kho tổng `all_jobs_unified` hiện có: {len(unified_jobs)} jobs.")

    # Tạo chỉ mục công ty (Company Index Blocking) để so sánh cực nhanh
    company_index: Dict[str, List[int]] = {}
    for idx, u_job in enumerate(unified_jobs):
        c_norm = normalize_text(u_job.get("company_name"))
        # Gom nhóm theo 3 ký tự đầu của tên công ty
        key = c_norm[:3] if len(c_norm) >= 3 else c_norm
        company_index.setdefault(key, []).append(idx)

    new_jobs_to_insert: List[Dict[str, Any]] = []
    duplicate_count = 0
    total_source_jobs = 0
    source_stats: Dict[str, Dict[str, int]] = {}

    # 2. Quét qua từng bảng nguồn
    for source in target_sources:
        tbl_name = f"jobs_{sanitize_table_name(source)}"
        src_jobs = fetch_table_jobs(tbl_name)
        total_source_jobs += len(src_jobs)
        source_stats[source] = {"total": len(src_jobs), "new": 0, "duplicate": 0}

        if not src_jobs:
            logger.info(f"  - Bảng `{tbl_name}`: 0 jobs.")
            continue

        logger.info(f"  - Đang kiểm tra `{tbl_name}` ({len(src_jobs)} jobs)...")

        for inc in src_jobs:
            c_norm = normalize_text(inc.get("company_name"))
            key = c_norm[:3] if len(c_norm) >= 3 else c_norm

            # Tìm ứng viên tiềm năng cùng nhóm công ty trong unified_jobs
            candidate_indices = company_index.get(key, [])

            found_duplicate = False
            matched_unified_idx = -1

            for u_idx in candidate_indices:
                cand = unified_jobs[u_idx]

                # Nếu cùng job_url thì hiển nhiên là cùng 1 job
                if inc.get("job_url") and inc.get("job_url") == cand.get("job_url"):
                    found_duplicate = True
                    matched_unified_idx = u_idx
                    break

                is_dup, _ = is_duplicate_job(inc, cand, threshold=threshold)
                if is_dup:
                    found_duplicate = True
                    matched_unified_idx = u_idx
                    break

            if found_duplicate:
                duplicate_count += 1
                source_stats[source]["duplicate"] += 1

                # Ghi nhận liên kết nguồn phụ vào extra_info của job đã có
                if matched_unified_idx >= 0:
                    matched_job = unified_jobs[matched_unified_idx]
                    extra = matched_job.get("extra_info") or {}
                    dup_sources = extra.get("duplicate_sources", [])
                    dup_entry = {"source": inc.get("source"), "job_url": inc.get("job_url")}
                    if dup_entry not in dup_sources:
                        dup_sources.append(dup_entry)
                        extra["duplicate_sources"] = dup_sources
                        matched_job["extra_info"] = extra
            else:
                # Job mới duy nhất!
                new_jobs_to_insert.append(inc)
                source_stats[source]["new"] += 1

                # Đưa vào unified_jobs cục bộ và cập nhật index ngay lập tức
                # để các job tiếp theo từ các source khác cũng được so khớp khử trùng
                new_idx = len(unified_jobs)
                unified_jobs.append(inc)
                company_index.setdefault(key, []).append(new_idx)

    # 3. Batch Upsert các job mới vào all_jobs_unified
    if new_jobs_to_insert:
        logger.info(f"\n💾 Đang lưu {len(new_jobs_to_insert)} job mới vào `all_jobs_unified`...")
        tuples = [standardize_job_dict(j) for j in new_jobs_to_insert]
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    get_upsert_jobs_sql("all_jobs_unified"),
                    tuples,
                    template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    page_size=100
                )
            conn.commit()
        logger.info(f"✅ Đã upsert thành công {len(new_jobs_to_insert)} job mới vào `all_jobs_unified`.")
    else:
        logger.info("\n✅ Không có job mới nào cần thêm (tất cả đã có hoặc bị trùng lặp).")

    # 4. In báo cáo tổng kết
    logger.info("\n" + "=" * 60)
    logger.info("📊 BÁO CÁO TỔNG KẾT ĐỒNG BỘ & KHỬ TRÙNG LẶP")
    logger.info("=" * 60)
    logger.info(f"Tổng số job quét từ các bảng nguồn : {total_source_jobs}")
    logger.info(f"Số job trùng lặp đã phát hiện & lọc bỏ : {duplicate_count}")
    logger.info(f"Số job mới đã nạp vào all_jobs_unified : {len(new_jobs_to_insert)}")
    logger.info(f"Tổng số job hiện tại trong all_jobs_unified: {len(unified_jobs)}")
    logger.info("-" * 60)
    for src, st in source_stats.items():
        logger.info(f"  • {src:<15}: Tổng {st['total']} | Mới: {st['new']} | Trùng: {st['duplicate']}")
    logger.info("=" * 60)

    return {
        "total_source_jobs": total_source_jobs,
        "new_jobs_inserted": len(new_jobs_to_insert),
        "duplicates_detected": duplicate_count,
        "total_unified_jobs": len(unified_jobs),
        "source_stats": source_stats
    }


def main():
    parser = argparse.ArgumentParser(description="Sync and deduplicate jobs into all_jobs_unified")
    parser.add_argument("--sources", type=str, default=None, help="Comma-separated source names")
    parser.add_argument("--threshold", type=float, default=0.90, help="Similarity threshold (default 0.90)")

    args = parser.parse_args()
    selected_sources = [s.strip() for s in args.sources.split(",")] if args.sources else None

    sync_all_sources_to_unified(sources=selected_sources, threshold=args.threshold)


if __name__ == "__main__":
    main()
