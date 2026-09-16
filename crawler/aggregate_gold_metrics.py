"""
Gold Metrics Aggregator and Database Indexing Pipeline for Job Hunter.
Performs two critical optimizations:
1. Creates high-performance B-Tree and GIN Trigram indexes on `all_jobs_unified` and raw job tables.
2. Pre-calculates comprehensive analytical and monitoring metrics and stores them into `gold_*` tables:
   - `gold_overview_stats` (Dashboard KPIs, sources breakdown, top locations, latest jobs)
   - `gold_skill_trends` (Tech stack popularity, percentages, estimated salaries, badges)
   - `gold_salary_benchmarks` (Salary by experience levels, city benchmarks, high-paying companies)
   - `gold_company_stats` (Company rankings, industry sectors distribution, sample positions)
   - `gold_crawler_metrics` (Pipeline crawler status, per-spider statistics, deduplication rates)
"""

import sys
import json
import logging
import datetime
from pathlib import Path
from typing import Dict, Any, List

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from crawler.db import get_db_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("GoldMetricsAggregator")

KNOWN_SOURCES = [
    "careerlink",
    "careerviet",
    "topcv",
    "vieclam24h",
    "vietnamworks",
    "jobsgo",
    "joboko",
]

TECH_LIST = [
    {"name": "React / Next.js", "category": "Framework", "pattern": "React|Next.?js", "avgSalary": "25 - 45 tr", "badge": "Hot 🔥"},
    {"name": "Python / AI / ML", "category": "Language", "pattern": "Python|Django|FastAPI|PyTorch|TensorFlow", "avgSalary": "30 - 60 tr", "badge": "Hot 🔥"},
    {"name": "Java / Spring Boot", "category": "Language", "pattern": "Java|Spring", "avgSalary": "28 - 50 tr", "badge": "Phổ biến ⚡"},
    {"name": "Golang", "category": "Language", "pattern": "Go|Golang", "avgSalary": "35 - 65 tr", "badge": "Tăng trưởng ↗️"},
    {"name": "TypeScript / Node.js", "category": "Language", "pattern": "TypeScript|Node.?js|Express|Nest", "avgSalary": "25 - 45 tr", "badge": "Phổ biến ⚡"},
    {"name": "Automation Test / QA", "category": "Tool", "pattern": "Test|QA|QC|Selenium|Appium|Cypress", "avgSalary": "20 - 40 tr", "badge": "Hot 🔥"},
    {"name": "Docker / Kubernetes / DevOps", "category": "Database/Cloud", "pattern": "Docker|Kubernetes|DevOps|CI.?CD", "avgSalary": "35 - 70 tr", "badge": "Tăng trưởng ↗️"},
    {"name": "AWS / Cloud Computing", "category": "Database/Cloud", "pattern": "AWS|Azure|GCP|Cloud", "avgSalary": "32 - 60 tr", "badge": "Tăng trưởng ↗️"},
    {"name": "PostgreSQL / SQL / Database", "category": "Database/Cloud", "pattern": "Postgres|SQL|MySQL|Database|MongoDB", "avgSalary": "25 - 45 tr", "badge": "Phổ biến ⚡"},
    {"name": "Flutter / Mobile", "category": "Framework", "pattern": "Flutter|React Native|iOS|Android|Mobile|Swift|Kotlin", "avgSalary": "22 - 42 tr", "badge": "Phổ biến ⚡"},
    {"name": ".NET / C#", "category": "Language", "pattern": "\\.NET|C#|CSharp", "avgSalary": "25 - 48 tr", "badge": "Phổ biến ⚡"},
    {"name": "Vue.js / Nuxt", "category": "Framework", "pattern": "Vue|Nuxt", "avgSalary": "22 - 38 tr", "badge": "Phổ biến ⚡"},
]

SPIDER_CONFIGS = [
    {"source": "topcv", "name": "TopCV Vietnam", "engine": "curl_cffi"},
    {"source": "vietnamworks", "name": "VietnamWorks", "engine": "playwright"},
    {"source": "careerlink", "name": "CareerLink VN", "engine": "requests"},
    {"source": "careerviet", "name": "CareerViet (CareerBuilder)", "engine": "requests"},
    {"source": "jobsgo", "name": "JobsGO", "engine": "requests"},
    {"source": "vieclam24h", "name": "Việc Làm 24h", "engine": "requests"},
    {"source": "joboko", "name": "Joboko", "engine": "requests"},
]


def ensure_indexes_and_gold_tables(conn) -> None:
    """Creates database indexes and schema definitions for Gold Metrics tables."""
    with conn.cursor() as cur:
        logger.info("Setting up PostgreSQL extensions and performance indexes...")
        # 1. Enable pg_trgm for fast similarity and fuzzy search
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.warning(f"Could not enable pg_trgm extension: {e}")

        # 2. B-Tree & GIN indexes on all_jobs_unified
        index_queries = [
            "CREATE INDEX IF NOT EXISTS idx_unified_created_at ON all_jobs_unified (created_at DESC);",
            "CREATE INDEX IF NOT EXISTS idx_unified_source ON all_jobs_unified (source);",
            "CREATE INDEX IF NOT EXISTS idx_unified_source_created ON all_jobs_unified (source, created_at DESC);",
            "CREATE INDEX IF NOT EXISTS idx_unified_location ON all_jobs_unified (location_short);",
            "CREATE INDEX IF NOT EXISTS idx_unified_level ON all_jobs_unified (level);",
            "CREATE INDEX IF NOT EXISTS idx_unified_work_type ON all_jobs_unified (work_type);",
            "CREATE INDEX IF NOT EXISTS idx_unified_experience ON all_jobs_unified (experience);",
            "CREATE INDEX IF NOT EXISTS idx_unified_company ON all_jobs_unified (company_name);",
        ]

        # Trigram GIN indexes for fast text pattern matching
        gin_queries = [
            "CREATE INDEX IF NOT EXISTS idx_unified_title_trgm ON all_jobs_unified USING gin (job_title gin_trgm_ops);",
            "CREATE INDEX IF NOT EXISTS idx_unified_company_trgm ON all_jobs_unified USING gin (company_name gin_trgm_ops);",
            "CREATE INDEX IF NOT EXISTS idx_unified_keyword_trgm ON all_jobs_unified USING gin (keyword gin_trgm_ops);",
        ]

        for q in index_queries:
            try:
                cur.execute(q)
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.warning(f"Index creation notice: {e}")

        for q in gin_queries:
            try:
                cur.execute(q)
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.warning(f"GIN Trigram index creation notice: {e}")

        # 3. Create Gold Tables
        logger.info("Ensuring Gold Metric tables exist...")
        gold_table_ddl = """
        CREATE TABLE IF NOT EXISTS gold_overview_stats (
            id INT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS gold_skill_trends (
            id INT PRIMARY KEY,
            total_jobs INT NOT NULL,
            trends JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS gold_salary_benchmarks (
            id INT PRIMARY KEY,
            total_jobs INT NOT NULL,
            levels JSONB NOT NULL,
            cities JSONB NOT NULL,
            top_companies JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS gold_company_stats (
            id INT PRIMARY KEY,
            total_companies INT NOT NULL,
            total_jobs INT NOT NULL,
            companies JSONB NOT NULL,
            sectors JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS gold_crawler_metrics (
            id INT PRIMARY KEY,
            total_raw INT NOT NULL,
            total_unified INT NOT NULL,
            total_duplicates INT NOT NULL,
            overall_dedup_percent INT NOT NULL,
            spiders JSONB NOT NULL,
            cron_schedule JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS gold_dashboard_metrics (
            id INT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """
        cur.execute(gold_table_ddl)
        conn.commit()
        logger.info("All indexes and Gold tables initialized successfully.")


def infer_industry_sector(company: str, title: str, req: str) -> str:
    text = f"{company} {title} {req}".lower()
    if any(k in text for k in ["bank", "ngân hàng", "fintech", "chứng khoán", "thanh toán", "ví điện tử"]):
        return "Fintech & Ngân hàng"
    if any(k in text for k in ["fpt", "viettel", "vnpt", "viễn thông", "telecom"]):
        return "Tập đoàn Công nghệ & Viễn thông"
    if any(k in text for k in ["shopee", "tiki", "lazada", "thương mại", "retail", "e-commerce", "bán lẻ"]):
        return "Thương Mại Điện Tử & Bán Lẻ"
    if any(k in text for k in ["game", "unity", "vng", "gameloft"]):
        return "Game & Giải Trí Trực Tuyến"
def normalize_vietnam_province(loc_str: str) -> str:
    if not loc_str:
        return "Khác / Chưa rõ"
    l = loc_str.lower().strip()
    if any(k in l for k in ["hà nội", "ha noi", "thủ đô", "thành phố hà nội", "hn"]):
        return "Hà Nội"
    if any(k in l for k in ["hồ chí minh", "ho chi minh", "hcm", "tp hcm", "tp. hcm", "sài gòn", "sai gon", "tp.hcm"]):
        return "Hồ Chí Minh"
    if any(k in l for k in ["đà nẵng", "da nang", "tp đà nẵng", "tp da nang", "dn"]):
        return "Đà Nẵng"
    if any(k in l for k in ["hải phòng", "hai phong"]):
        return "Hải Phòng"
    if any(k in l for k in ["bình dương", "binh duong"]):
        return "Bình Dương"
    if any(k in l for k in ["bắc ninh", "bac ninh"]):
        return "Bắc Ninh"
    if any(k in l for k in ["đồng nai", "dong nai"]):
        return "Đồng Nai"
    if any(k in l for k in ["hưng yên", "hung yen"]):
        return "Hưng Yên"
    if any(k in l for k in ["hải dương", "hai duong"]):
        return "Hải Dương"
    if any(k in l for k in ["cần thơ", "can tho"]):
        return "Cần Thơ"
    if any(k in l for k in ["bà rịa", "vũng tàu", "ba ria", "vung tau"]):
        return "Bà Rịa - Vũng Tàu"
    if any(k in l for k in ["khánh hòa", "khanh hoa", "nha trang"]):
        return "Khánh Hòa"
    if any(k in l for k in ["quảng ninh", "quang ninh"]):
        return "Quảng Ninh"
    if any(k in l for k in ["thái nguyên", "thai nguyen"]):
        return "Thái Nguyên"
    if any(k in l for k in ["vĩnh phúc", "vinh phuc"]):
        return "Vĩnh Phúc"
    if any(k in l for k in ["thừa thiên huế", "thua thien hue", "huế", "hue"]):
        return "Thừa Thiên Huế"
    if any(k in l for k in ["quảng nam", "quang nam"]):
        return "Quảng Nam"
    if any(k in l for k in ["lâm đồng", "lam dong", "đà lạt", "da lat"]):
        return "Lâm Đồng"
    if any(k in l for k in ["long an"]):
        return "Long An"
    if any(k in l for k in ["nghệ an", "nghe an", "vinh"]):
        return "Nghệ An"
    if any(k in l for k in ["thanh hóa", "thanh hoa"]):
        return "Thanh Hóa"
    if any(k in l for k in ["bắc giang", "bac giang"]):
        return "Bắc Giang"
    if any(k in l for k in ["nam định", "nam dinh"]):
        return "Nam Định"
    if any(k in l for k in ["thái bình", "thai binh"]):
        return "Thái Bình"
    if any(k in l for k in ["hà nam", "ha nam"]):
        return "Hà Nam"
    if any(k in l for k in ["quảng ngãi", "quang ngai"]):
        return "Quảng Ngãi"
    if any(k in l for k in ["bình định", "binh dinh", "quy nhơn"]):
        return "Bình Định"
    if any(k in l for k in ["bình phước", "binh phuoc"]):
        return "Bình Phước"
    if any(k in l for k in ["tây ninh", "tay ninh"]):
        return "Tây Ninh"
    if any(k in l for k in ["tiền giang", "tien giang"]):
        return "Tiền Giang"
    if any(k in l for k in ["bến tre", "ben tre"]):
        return "Bến Tre"
    if any(k in l for k in ["kiên giang", "kien giang", "phú quốc"]):
        return "Kiên Giang"
    if any(k in l for k in ["cà mau", "ca mau"]):
        return "Cà Mau"
    if any(k in l for k in ["toàn quốc", "remote", "toan quoc"]):
        return "Toàn quốc / Remote"
    return "Khác / Chưa rõ"


def aggregate_overview_stats(conn) -> Dict[str, Any]:
    logger.info("Computing gold_overview_stats & gold_dashboard_metrics...")
    with conn.cursor() as cur:
        # Total unified
        cur.execute("SELECT COUNT(*) FROM all_jobs_unified;")
        total_unified = cur.fetchone()[0] or 0

        # Total distinct companies
        cur.execute("SELECT COUNT(DISTINCT company_name) FROM all_jobs_unified WHERE company_name IS NOT NULL AND company_name != '';")
        total_companies = cur.fetchone()[0] or 0

        # Unified count per source
        cur.execute("SELECT LOWER(source), COUNT(*) FROM all_jobs_unified WHERE source IS NOT NULL GROUP BY LOWER(source);")
        unified_by_source = {row[0]: row[1] for row in cur.fetchall()}

        # Raw counts per source table
        sources_stats = []
        total_raw_jobs = 0
        for src in KNOWN_SOURCES:
            raw_count = 0
            try:
                cur.execute(f"SELECT COUNT(*) FROM jobs_{src};")
                raw_count = cur.fetchone()[0] or 0
            except Exception:
                conn.rollback()
                raw_count = unified_by_source.get(src, 0)

            total_raw_jobs += raw_count
            sources_stats.append({
                "source": src,
                "rawCount": raw_count,
                "unifiedCount": unified_by_source.get(src, 0),
            })

        # Duplicates detected
        total_duplicates = 0
        try:
            cur.execute("""
                SELECT COUNT(*) 
                FROM all_jobs_unified 
                WHERE extra_info->'duplicate_sources' IS NOT NULL 
                  AND jsonb_array_length(extra_info->'duplicate_sources') > 0;
            """)
            total_duplicates = cur.fetchone()[0] or 0
        except Exception:
            conn.rollback()

        # Top locations
        cur.execute("""
            SELECT 
                COALESCE(NULLIF(TRIM(location_short), ''), 'Khác / Chưa rõ') as location,
                COUNT(*) as count
            FROM all_jobs_unified
            GROUP BY location
            ORDER BY count DESC
            LIMIT 8;
        """)
        top_locations = [{"location": r[0], "count": r[1]} for r in cur.fetchall()]

        # Top 8 hiring companies
        cur.execute("""
            SELECT 
                company_name, 
                COUNT(*) as job_count, 
                MAX(company_logo) as logo,
                MAX(salary) as sample_salary,
                ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(location_short), ''), 'Chưa rõ')) as locations
            FROM all_jobs_unified
            WHERE company_name IS NOT NULL AND company_name != ''
            GROUP BY company_name
            ORDER BY job_count DESC
            LIMIT 15;
        """)
        top_hiring_companies = []
        for r in cur.fetchall():
            top_hiring_companies.append({
                "company_name": r[0],
                "job_count": r[1],
                "logo": r[2],
                "sample_salary": r[3],
                "locations": (r[4] or [])[:2],
            })

        # Latest jobs (top 8)
        cur.execute("""
            SELECT 
                job_url, source, job_title, company_name, company_url, company_logo,
                salary, experience, level, work_type, location_short,
                posted_date, deadline, keyword, extra_info, created_at
            FROM all_jobs_unified
            ORDER BY created_at DESC
            LIMIT 8;
        """)
        colnames = [desc[0] for desc in cur.description]
        latest_jobs = []
        for row in cur.fetchall():
            item = dict(zip(colnames, row))
            if isinstance(item.get("created_at"), (datetime.date, datetime.datetime)):
                item["created_at"] = item["created_at"].isoformat()
            latest_jobs.append(item)

        # Facet metadata for jobs page filters
        cur.execute("""
            SELECT source, COUNT(*) as count 
            FROM all_jobs_unified 
            WHERE source IS NOT NULL AND source != ''
            GROUP BY source 
            ORDER BY count DESC;
        """)
        sources_facets = [{"source": r[0], "count": r[1]} for r in cur.fetchall()]

        cur.execute("""
            SELECT location_short as location, COUNT(*) as count 
            FROM all_jobs_unified 
            WHERE location_short IS NOT NULL AND location_short != ''
            GROUP BY location_short 
            ORDER BY count DESC 
            LIMIT 15;
        """)
        locations_facets = [{"location": r[0], "count": r[1]} for r in cur.fetchall()]

        cur.execute("""
            SELECT level, COUNT(*) as count 
            FROM all_jobs_unified 
            WHERE level IS NOT NULL AND level != ''
            GROUP BY level 
            ORDER BY count DESC 
            LIMIT 15;
        """)
        levels_facets = [{"level": r[0], "count": r[1]} for r in cur.fetchall()]

        # 4. Normalized Vietnam Provinces Distribution (Jobs & Companies) for Vietnam Map
        cur.execute("SELECT location_short, company_name FROM all_jobs_unified;")
        province_map: Dict[str, Dict[str, Any]] = {
            "Hà Nội": {"jobs": 0, "companies": set()},
            "Đà Nẵng": {"jobs": 0, "companies": set()},
            "Hồ Chí Minh": {"jobs": 0, "companies": set()},
        }

        for row in cur.fetchall():
            raw_loc, comp = row
            norm_prov = normalize_vietnam_province(raw_loc)
            if norm_prov not in province_map:
                province_map[norm_prov] = {"jobs": 0, "companies": set()}
            province_map[norm_prov]["jobs"] += 1
            if comp and comp.strip():
                province_map[norm_prov]["companies"].add(comp.strip())

        provinces_list = []
        for prov_name, p_data in province_map.items():
            j_cnt = p_data["jobs"]
            c_cnt = len(p_data["companies"])
            pct = round((j_cnt / max(1, total_unified)) * 100, 1)
            provinces_list.append({
                "province": prov_name,
                "jobCount": j_cnt,
                "companyCount": c_cnt,
                "percentage": pct,
            })

        provinces_list.sort(key=lambda x: x["jobCount"], reverse=True)

        data = {
            "totalUnified": total_unified,
            "totalRawJobs": total_raw_jobs,
            "totalDuplicatesDetected": total_duplicates,
            "totalCompanies": total_companies,
            "sources": sources_stats,
            "topLocations": top_locations,
            "provinces": provinces_list,
            "topHiringCompanies": top_hiring_companies,
            "latestJobs": latest_jobs,
            "lastCrawledAt": latest_jobs[0]["created_at"] if latest_jobs else datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "filtersAvailable": {
                "sources": sources_facets,
                "locations": locations_facets,
                "levels": levels_facets,
            }
        }

        # Upsert both gold_overview_stats and gold_dashboard_metrics
        cur.execute("""
            INSERT INTO gold_overview_stats (id, data, updated_at)
            VALUES (1, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP;
        """, (json.dumps(data, ensure_ascii=False),))

        cur.execute("""
            INSERT INTO gold_dashboard_metrics (id, data, updated_at)
            VALUES (1, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = CURRENT_TIMESTAMP;
        """, (json.dumps(data, ensure_ascii=False),))

        conn.commit()
        logger.info(f"gold_overview_stats & gold_dashboard_metrics updated (Total: {total_unified}, Companies: {total_companies}, Duplicates: {total_duplicates})")
        return data


def aggregate_skill_trends(conn) -> Dict[str, Any]:
    logger.info("Computing gold_skill_trends...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM all_jobs_unified;")
        total_jobs = max(1, cur.fetchone()[0] or 1)

        trends = []
        for tech in TECH_LIST:
            sql = """
                SELECT COUNT(*) 
                FROM all_jobs_unified 
                WHERE job_title ~* %s 
                   OR job_requirements ~* %s 
                   OR job_description ~* %s 
                   OR keyword ~* %s;
            """
            cur.execute(sql, (tech["pattern"], tech["pattern"], tech["pattern"], tech["pattern"]))
            count = cur.fetchone()[0] or 0
            share_percent = min(100, round((count / total_jobs) * 100))

            trends.append({
                "name": tech["name"],
                "category": tech["category"],
                "count": count,
                "sharePercent": share_percent,
                "avgSalaryEstimate": tech["avgSalary"],
                "badge": tech["badge"],
            })

        trends.sort(key=lambda x: x["count"], reverse=True)

        cur.execute("""
            INSERT INTO gold_skill_trends (id, total_jobs, trends, updated_at)
            VALUES (1, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                total_jobs = EXCLUDED.total_jobs,
                trends = EXCLUDED.trends,
                updated_at = CURRENT_TIMESTAMP;
        """, (total_jobs, json.dumps(trends, ensure_ascii=False)))
        conn.commit()
        logger.info(f"gold_skill_trends updated ({len(trends)} tech stacks analyzed)")
        return {"totalJobs": total_jobs, "trends": trends}


def aggregate_salary_benchmarks(conn) -> Dict[str, Any]:
    logger.info("Computing gold_salary_benchmarks...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM all_jobs_unified;")
        total_jobs = cur.fetchone()[0] or 0

        # 1. Levels
        level_stats = [
            {"level": "Thực tập / Intern / Fresher", "range": "5 - 12 triệu", "avgVnd": 8.5, "count": 0, "description": "Dành cho sinh viên mới ra trường hoặc dưới 1 năm kinh nghiệm"},
            {"level": "Nhân viên / Junior", "range": "15 - 25 triệu", "avgVnd": 20.0, "count": 0, "description": "Từ 1 - 2 năm kinh nghiệm vững chắc"},
            {"level": "Chuyên viên / Middle", "range": "25 - 40 triệu", "avgVnd": 32.5, "count": 0, "description": "Từ 2 - 4 năm kinh nghiệm độc lập"},
            {"level": "Kỹ sư Cấp cao / Senior", "range": "40 - 65 triệu", "avgVnd": 52.5, "count": 0, "description": "Trên 5 năm kinh nghiệm, làm chủ hệ thống"},
            {"level": "Trưởng nhóm / Quản lý / Lead", "range": "60 - 100+ triệu", "avgVnd": 80.0, "count": 0, "description": "Quản lý dự án, Tech Lead, Engineering Manager"},
        ]

        for lvl in level_stats:
            keyword = lvl["level"].split("/")[0].strip()
            cur.execute("SELECT COUNT(*) FROM all_jobs_unified WHERE level ILIKE %s OR job_title ILIKE %s;", (f"%{keyword}%", f"%{keyword}%"))
            lvl["count"] = cur.fetchone()[0] or 0

        # 2. City benchmarks
        city_list = ["Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Toàn quốc / Remote"]
        city_stats = []
        for city in city_list:
            search_key = "Hồ Chí Minh" if city == "Hồ Chí Minh" else ("Remote" if "Remote" in city else city)
            cur.execute("SELECT COUNT(*) FROM all_jobs_unified WHERE location_short ILIKE %s;", (f"%{search_key}%",))
            count = cur.fetchone()[0] or 0
            if city == "Hồ Chí Minh":
                avg_vnd = 35.5
                s_range = "22 - 65 triệu"
            elif city == "Đà Nẵng":
                avg_vnd = 26.5
                s_range = "18 - 45 triệu"
            elif "Remote" in city:
                avg_vnd = 42.0
                s_range = "25 - 80 triệu"
            else:
                avg_vnd = 32.0
                s_range = "20 - 55 triệu"
            city_stats.append({"city": city, "avgVnd": avg_vnd, "range": s_range, "jobCount": count})

        # 3. Top Paying & Hiring Companies
        cur.execute("""
            SELECT 
                company_name, 
                COUNT(*) as job_count, 
                MAX(salary) as sample_salary,
                MAX(company_logo) as logo
            FROM all_jobs_unified
            WHERE company_name IS NOT NULL AND company_name != ''
            GROUP BY company_name
            ORDER BY job_count DESC
            LIMIT 8;
        """)
        top_companies = [
            {
                "company_name": r[0],
                "job_count": r[1],
                "sample_salary": r[2],
                "logo": r[3],
            }
            for r in cur.fetchall()
        ]

        cur.execute("""
            INSERT INTO gold_salary_benchmarks (id, total_jobs, levels, cities, top_companies, updated_at)
            VALUES (1, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                total_jobs = EXCLUDED.total_jobs,
                levels = EXCLUDED.levels,
                cities = EXCLUDED.cities,
                top_companies = EXCLUDED.top_companies,
                updated_at = CURRENT_TIMESTAMP;
        """, (total_jobs, json.dumps(level_stats, ensure_ascii=False), json.dumps(city_stats, ensure_ascii=False), json.dumps(top_companies, ensure_ascii=False)))
        conn.commit()
        logger.info("gold_salary_benchmarks updated")
        return {"totalJobs": total_jobs, "levels": level_stats, "cities": city_stats, "topCompanies": top_companies}


def aggregate_company_stats(conn) -> Dict[str, Any]:
    logger.info("Computing gold_company_stats...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM all_jobs_unified;")
        total_jobs = max(1, cur.fetchone()[0] or 1)

        cur.execute("""
            SELECT 
                company_name,
                MAX(company_logo) as company_logo,
                MAX(company_url) as company_url,
                COUNT(*) as job_count,
                ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(location_short), ''), 'Chưa rõ')) as locations,
                ARRAY_AGG(DISTINCT job_title) as titles,
                MAX(salary) as sample_salary,
                MAX(COALESCE(job_requirements, '')) as sample_req
            FROM all_jobs_unified
            WHERE company_name IS NOT NULL AND company_name != ''
            GROUP BY company_name
            ORDER BY job_count DESC;
        """)

        sector_counts: Dict[str, Dict[str, Any]] = {}
        companies = []

        for row in cur.fetchall():
            comp_name, comp_logo, comp_url, j_count, locs, titles, sample_sal, sample_req = row
            titles_slice = (titles or [])[:3]
            sector = infer_industry_sector(comp_name or "", " ".join(titles_slice), sample_req or "")

            if sector not in sector_counts:
                sector_counts[sector] = {"count": 0, "companies": set()}
            sector_counts[sector]["count"] += j_count
            sector_counts[sector]["companies"].add(comp_name)

            companies.append({
                "company_name": comp_name,
                "company_logo": comp_logo,
                "company_url": comp_url,
                "job_count": j_count,
                "locations": (locs or [])[:3],
                "sample_titles": titles_slice,
                "sample_salary": sample_sal,
                "industry_sector": sector,
            })

        sectors = []
        for sec, val in sector_counts.items():
            sectors.append({
                "sector": sec,
                "count": val["count"],
                "percentage": round((val["count"] / total_jobs) * 100),
                "topCompanies": list(val["companies"])[:4],
            })
        sectors.sort(key=lambda x: x["count"], reverse=True)

        cur.execute("""
            INSERT INTO gold_company_stats (id, total_companies, total_jobs, companies, sectors, updated_at)
            VALUES (1, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                total_companies = EXCLUDED.total_companies,
                total_jobs = EXCLUDED.total_jobs,
                companies = EXCLUDED.companies,
                sectors = EXCLUDED.sectors,
                updated_at = CURRENT_TIMESTAMP;
        """, (len(companies), total_jobs, json.dumps(companies, ensure_ascii=False), json.dumps(sectors, ensure_ascii=False)))
        conn.commit()
        logger.info(f"gold_company_stats updated ({len(companies)} companies categorized)")
        return {"totalCompanies": len(companies), "totalJobs": total_jobs, "companies": companies, "sectors": sectors}


def aggregate_crawler_metrics(conn) -> Dict[str, Any]:
    logger.info("Computing gold_crawler_metrics...")
    with conn.cursor() as cur:
        total_raw_scraped = 0
        spiders = []

        for cfg in SPIDER_CONFIGS:
            raw_table = f"jobs_{cfg['source']}"
            raw_count = 0
            unified_count = 0

            try:
                cur.execute(f"SELECT COUNT(*) FROM {raw_table};")
                raw_count = cur.fetchone()[0] or 0
            except Exception:
                conn.rollback()
                raw_count = 0

            try:
                cur.execute("SELECT COUNT(*) FROM all_jobs_unified WHERE LOWER(source) = %s;", (cfg["source"],))
                unified_count = cur.fetchone()[0] or 0
            except Exception:
                conn.rollback()
                unified_count = 0

            total_raw_scraped += raw_count
            dedup_ratio = round(((raw_count - unified_count) / raw_count) * 100) if raw_count > 0 else 0

            spiders.append({
                "source": cfg["source"],
                "displayName": cfg["name"],
                "status": "ACTIVE" if raw_count > 0 else "IDLE",
                "rawTable": raw_table,
                "rawCount": raw_count,
                "unifiedCount": unified_count,
                "dedupRatio": max(0, dedup_ratio),
                "lastRun": "12:00 & 00:00 (Hàng ngày)",
                "engine": cfg["engine"],
            })

        cur.execute("SELECT COUNT(*) FROM all_jobs_unified;")
        total_unified_saved = cur.fetchone()[0] or 0

        total_duplicates_merged = 0
        try:
            cur.execute("""
                SELECT COUNT(*) 
                FROM all_jobs_unified 
                WHERE extra_info->'duplicate_sources' IS NOT NULL 
                  AND jsonb_array_length(extra_info->'duplicate_sources') > 0;
            """)
            total_duplicates_merged = cur.fetchone()[0] or 0
        except Exception:
            conn.rollback()

        overall_dedup_percent = (
            round(((total_raw_scraped - total_unified_saved) / total_raw_scraped) * 100)
            if total_raw_scraped > 0 else 0
        )

        cron_schedule = {
            "expression": "0 0,6,12,18 * * * (UTC)",
            "scheduleDescription": "Tính toán metric tự động 4 lần/ngày lúc 01:00, 07:00, 13:00, 19:00 (GMT+7)",
            "parallelWorkers": 3,
            "alertChannel": "Telegram Bot Alert (ID: 6204378947)",
        }

        cur.execute("""
            INSERT INTO gold_crawler_metrics (id, total_raw, total_unified, total_duplicates, overall_dedup_percent, spiders, cron_schedule, updated_at)
            VALUES (1, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                total_raw = EXCLUDED.total_raw,
                total_unified = EXCLUDED.total_unified,
                total_duplicates = EXCLUDED.total_duplicates,
                overall_dedup_percent = EXCLUDED.overall_dedup_percent,
                spiders = EXCLUDED.spiders,
                cron_schedule = EXCLUDED.cron_schedule,
                updated_at = CURRENT_TIMESTAMP;
        """, (
            total_raw_scraped,
            total_unified_saved,
            total_duplicates_merged,
            max(0, overall_dedup_percent),
            json.dumps(spiders, ensure_ascii=False),
            json.dumps(cron_schedule, ensure_ascii=False),
        ))
        conn.commit()
        logger.info("gold_crawler_metrics updated")
        return {
            "totalRawScraped": total_raw_scraped,
            "totalUnifiedSaved": total_unified_saved,
            "totalDuplicatesMerged": total_duplicates_merged,
            "overallDedupPercent": max(0, overall_dedup_percent),
            "spiders": spiders,
        }


def run_all_aggregations() -> None:
    """Entrypoint to run all indexing and gold table pre-calculations."""
    start_time = datetime.datetime.now()
    logger.info("Starting Gold Metrics Aggregation Pipeline...")

    conn = get_db_connection()
    try:
        ensure_indexes_and_gold_tables(conn)
        aggregate_overview_stats(conn)
        aggregate_skill_trends(conn)
        aggregate_salary_benchmarks(conn)
        aggregate_company_stats(conn)
        aggregate_crawler_metrics(conn)

        elapsed = (datetime.datetime.now() - start_time).total_seconds()
        logger.info(f"✅ Successfully completed all Gold Metrics Aggregations in {elapsed:.2f} seconds.")
    finally:
        conn.close()


if __name__ == "__main__":
    run_all_aggregations()
