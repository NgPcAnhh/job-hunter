"""
Supabase PostgreSQL Database Management Module for Job Hunter.
Handles connection pooling, automatic IPv4 fallback for local environments,
table management for per-source tables (`jobs_<source>`), and unified table `all_jobs_unified`.
"""

import os
import re
import json
import logging
from typing import List, Dict, Any, Optional

import psycopg2
from psycopg2.extras import execute_values, Json
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

PRIMARY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:phucanhnguyen04082004@db.xltonipyxbdivoljvemc.supabase.co:5432/postgres"
)

# Fallback pooler URL specifically for environments where db.<ref>.supabase.co
# cannot resolve IPv6 addresses (common on Windows local development and GitHub Actions runners)
FALLBACK_POOLER_URL = os.getenv(
    "DATABASE_POOLER_URL",
    "postgresql://postgres.xltonipyxbdivoljvemc:phucanhnguyen04082004@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
)


def derive_pooler_url(direct_url: Optional[str]) -> Optional[str]:
    """
    Auto-converts a direct Supabase URL (db.<ref>.supabase.co:5432) to Supavisor Pooler URL.
    Direct Supabase URLs are IPv6-only on Supabase Free Tier, causing 'Network is unreachable'
    on GitHub Actions Ubuntu runners and IPv4-only environments.
    """
    if not direct_url:
        return None
    # Matches: postgresql://[user]:[pass]@db.[ref].supabase.co:[port]/[dbname]
    m = re.match(
        r"^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@db\.([^\.]+)\.supabase\.co(?::\d+)?\/(.*)$",
        direct_url.strip()
    )
    if m:
        protocol, user, password, ref, db_name = m.groups()
        # In Supabase pooler, username is formatted as <user>.<ref>
        pooler_user = f"{user}.{ref}" if "." not in user else user
        return f"{protocol}{pooler_user}:{password}@aws-0-ap-southeast-1.pooler.supabase.com:5432/{db_name}"
    return None


def get_candidate_db_urls() -> List[str]:
    """
    Returns an ordered list of connection URLs to attempt, prioritizing IPv4-compatible
    Pooler URLs first to prevent 'Network is unreachable' failures on CI runners.
    """
    candidates = []

    def _add(url: Optional[str]):
        if url and url.strip() and url.strip() not in candidates:
            candidates.append(url.strip())

    env_pooler = os.getenv("DATABASE_POOLER_URL")
    env_primary = os.getenv("DATABASE_URL")

    # 1. Explicit pooler URL from environment
    _add(env_pooler)

    # 2. If PRIMARY DATABASE_URL is already a pooler URL, use it directly
    if env_primary and "pooler.supabase.com" in env_primary:
        _add(env_primary)

    # 3. If PRIMARY DATABASE_URL is direct, derive the pooler URL first
    if env_primary and "db." in env_primary and "supabase.co" in env_primary:
        _add(derive_pooler_url(env_primary))

    # 4. Fallback pooler URL
    _add(FALLBACK_POOLER_URL)

    # 5. Direct primary URL (for IPv6-enabled networks)
    _add(env_primary)
    _add(PRIMARY_DATABASE_URL)

    return candidates


# Cache initialized tables in process memory to avoid redundant DDL statements
_INITIALIZED_TABLES = set()


def sanitize_table_name(name: str) -> str:
    """Sanitize table name to prevent SQL injection and invalid identifiers."""
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", name.strip().lower())
    return cleaned if cleaned else "unknown"


def get_create_table_sql(table_name: str) -> str:
    """Generate DDL for any jobs table (source-specific or unified)."""
    clean_name = sanitize_table_name(table_name)
    return f"""
    CREATE TABLE IF NOT EXISTS {clean_name} (
        job_url TEXT PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        job_title TEXT NOT NULL,
        company_name TEXT,
        company_url TEXT,
        company_logo TEXT,
        salary TEXT,
        experience TEXT,
        level TEXT,
        work_type TEXT,
        education TEXT,
        industry TEXT,
        location_short TEXT,
        workplace_detail TEXT,
        working_time TEXT,
        posted_date TEXT,
        deadline TEXT,
        keyword TEXT,
        job_description TEXT,
        job_requirements TEXT,
        benefits TEXT,
        extra_info JSONB DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_{clean_name}_source ON {clean_name}(source);
    CREATE INDEX IF NOT EXISTS idx_{clean_name}_company ON {clean_name}(company_name);
    """


def get_upsert_jobs_sql(table_name: str) -> str:
    """Generate idempotent upsert query for specified table."""
    clean_name = sanitize_table_name(table_name)
    return f"""
    INSERT INTO {clean_name} (
        job_url,
        source,
        job_title,
        company_name,
        company_url,
        company_logo,
        salary,
        experience,
        level,
        work_type,
        education,
        industry,
        location_short,
        workplace_detail,
        working_time,
        posted_date,
        deadline,
        keyword,
        job_description,
        job_requirements,
        benefits,
        extra_info
    ) VALUES %s
    ON CONFLICT (job_url) DO UPDATE SET
        source = EXCLUDED.source,
        job_title = EXCLUDED.job_title,
        company_name = COALESCE(EXCLUDED.company_name, {clean_name}.company_name),
        company_url = COALESCE(EXCLUDED.company_url, {clean_name}.company_url),
        company_logo = COALESCE(EXCLUDED.company_logo, {clean_name}.company_logo),
        salary = COALESCE(EXCLUDED.salary, {clean_name}.salary),
        experience = COALESCE(EXCLUDED.experience, {clean_name}.experience),
        level = COALESCE(EXCLUDED.level, {clean_name}.level),
        work_type = COALESCE(EXCLUDED.work_type, {clean_name}.work_type),
        education = COALESCE(EXCLUDED.education, {clean_name}.education),
        industry = COALESCE(EXCLUDED.industry, {clean_name}.industry),
        location_short = COALESCE(EXCLUDED.location_short, {clean_name}.location_short),
        workplace_detail = COALESCE(EXCLUDED.workplace_detail, {clean_name}.workplace_detail),
        working_time = COALESCE(EXCLUDED.working_time, {clean_name}.working_time),
        posted_date = COALESCE(EXCLUDED.posted_date, {clean_name}.posted_date),
        deadline = COALESCE(EXCLUDED.deadline, {clean_name}.deadline),
        keyword = COALESCE(EXCLUDED.keyword, {clean_name}.keyword),
        job_description = COALESCE(EXCLUDED.job_description, {clean_name}.job_description),
        job_requirements = COALESCE(EXCLUDED.job_requirements, {clean_name}.job_requirements),
        benefits = COALESCE(EXCLUDED.benefits, {clean_name}.benefits),
        extra_info = EXCLUDED.extra_info;
    """


def get_db_connection() -> psycopg2.extensions.connection:
    """
    Establish a connection to PostgreSQL/Supabase.
    Automatically cycles through candidate URLs (Pooler, derived pooler, direct host)
    to guarantee successful connectivity regardless of IPv6/IPv4 network environment.
    """
    candidate_urls = get_candidate_db_urls()
    last_err: Optional[Exception] = None

    for url in candidate_urls:
        masked_url = re.sub(r":([^@]+)@", ":***@", url)
        try:
            conn = psycopg2.connect(url, connect_timeout=10)
            return conn
        except Exception as err:
            last_err = err
            logger.warning(
                f"Supabase connection attempt to [{masked_url}] failed: {err}. "
                f"Trying next connection candidate..."
            )

    logger.error("❌ All candidate Supabase database connection attempts failed.")
    if last_err:
        raise last_err
    raise RuntimeError("No valid Supabase database URL configured.")


def ensure_table_exists(table_name: str = "all_jobs_unified") -> None:
    """Initialize table and indexes if not already present."""
    clean_name = sanitize_table_name(table_name)
    if clean_name in _INITIALIZED_TABLES:
        return

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(get_create_table_sql(clean_name))
        conn.commit()
    _INITIALIZED_TABLES.add(clean_name)
    logger.info(f"Table `{clean_name}` checked/created on Supabase.")


def ensure_source_table_exists(source: str) -> str:
    """Ensure table for specific source exists (e.g. jobs_topcv). Returns table name."""
    clean_source = sanitize_table_name(source)
    table_name = f"jobs_{clean_source}"
    ensure_table_exists(table_name)
    return table_name


def standardize_job_dict(job: Dict[str, Any]) -> tuple:
    """
    Normalizes a job dictionary to match the exact tuple structure of jobs tables.
    Extracts extra fields into extra_info JSON.
    """
    KNOWN_KEYS = {
        "job_url", "source", "job_title", "company_name", "company_url", "company_logo",
        "salary", "experience", "level", "work_type", "education", "industry",
        "location_short", "workplace_detail", "working_time", "posted_date", "deadline",
        "keyword", "job_description", "job_requirements", "benefits", "extra_info",
        "created_at"
    }

    # Extract any unexpected or crawler-specific fields to extra_info
    extra = {}
    if isinstance(job.get("extra_info"), dict):
        extra.update(job["extra_info"])

    for k, v in job.items():
        if k not in KNOWN_KEYS and v not in [None, "", []]:
            extra[k] = v

    return (
        job.get("job_url") or "",
        job.get("source") or "unknown",
        job.get("job_title") or "Unknown Title",
        job.get("company_name"),
        job.get("company_url"),
        job.get("company_logo"),
        job.get("salary"),
        job.get("experience"),
        job.get("level"),
        job.get("work_type"),
        job.get("education"),
        job.get("industry"),
        job.get("location_short"),
        job.get("workplace_detail"),
        job.get("working_time"),
        job.get("posted_date"),
        job.get("deadline"),
        job.get("keyword"),
        job.get("job_description"),
        job.get("job_requirements"),
        job.get("benefits"),
        Json(extra, dumps=lambda o: json.dumps(o, ensure_ascii=False, default=str))
    )


def upsert_jobs_to_supabase(jobs: List[Dict[str, Any]], table_name: str = "all_jobs_unified") -> int:
    """
    Batch upserts a list of crawled jobs into the specified table in Supabase.
    Returns the count of upserted jobs.
    """
    if not jobs:
        return 0

    valid_jobs = [j for j in jobs if j.get("job_url") and j.get("job_title")]
    if not valid_jobs:
        logger.warning("No valid jobs (with job_url and job_title) to save.")
        return 0

    clean_table = sanitize_table_name(table_name)
    ensure_table_exists(clean_table)

    tuples = [standardize_job_dict(j) for j in valid_jobs]

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            execute_values(
                cur,
                get_upsert_jobs_sql(clean_table),
                tuples,
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                page_size=100
            )
        conn.commit()
        logger.info(f"💾 [Supabase] Upserted {len(tuples)} jobs into `{clean_table}` successfully.")
        return len(tuples)
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"❌ Error upserting jobs to `{clean_table}`: {e}")
        raise
    finally:
        if conn:
            conn.close()


def upsert_jobs_to_source_table(jobs: List[Dict[str, Any]], source: str) -> int:
    """
    Upserts crawled jobs directly into the source-specific table: `jobs_<source>`.
    Example: source='topcv' -> saves into `jobs_topcv`.
    """
    clean_source = sanitize_table_name(source)
    table_name = f"jobs_{clean_source}"
    return upsert_jobs_to_supabase(jobs, table_name=table_name)
