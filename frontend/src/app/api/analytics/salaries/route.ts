import { NextResponse } from 'next/server';
import { query, queryCached } from '@/lib/db';
import { SalaryLevelStat, SalaryCityStat, SalaryRoleStat } from '@/types/job';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

const IT_ROLES_BENCHMARKS: SalaryRoleStat[] = [
  {
    key: 'data-ai',
    name: 'AI / Data / Machine Learning',
    shortName: 'AI & Data Science',
    avgVnd: 46.5,
    minVnd: 25,
    maxVnd: 95,
    range: '25 - 95 triệu',
    jobCount: 391,
    techs: [
      { name: 'LLM & GenAI', avg: 58, range: '40 - 120 tr' },
      { name: 'MLOps & PyTorch', avg: 48, range: '30 - 90 tr' },
      { name: 'Data Pipeline / BigQuery', avg: 44, range: '25 - 80 tr' },
      { name: 'PowerBI / Tableau', avg: 32, range: '18 - 55 tr' },
    ],
  },
  {
    key: 'devops',
    name: 'DevOps / Cloud / SRE',
    shortName: 'DevOps / Cloud',
    avgVnd: 44.0,
    minVnd: 25,
    maxVnd: 85,
    range: '25 - 85 triệu',
    jobCount: 25,
    techs: [
      { name: 'AWS / Cloud Architect', avg: 52, range: '35 - 100 tr' },
      { name: 'Kubernetes / Docker', avg: 45, range: '28 - 85 tr' },
      { name: 'CI/CD & Terraform', avg: 42, range: '25 - 75 tr' },
    ],
  },
  {
    key: 'security',
    name: 'Cyber Security / An Ninh Mạng',
    shortName: 'Cyber Security',
    avgVnd: 40.0,
    minVnd: 22,
    maxVnd: 75,
    range: '22 - 75 triệu',
    jobCount: 52,
    techs: [
      { name: 'Cloud Security', avg: 48, range: '30 - 90 tr' },
      { name: 'Penetration Testing (Pentest)', avg: 42, range: '25 - 80 tr' },
      { name: 'SOC Analyst / SIEM', avg: 36, range: '20 - 65 tr' },
    ],
  },
  {
    key: 'fullstack',
    name: 'Fullstack Developer',
    shortName: 'Fullstack Dev',
    avgVnd: 38.0,
    minVnd: 20,
    maxVnd: 75,
    range: '20 - 75 triệu',
    jobCount: 18,
    techs: [
      { name: 'Next.js + Serverless', avg: 42, range: '25 - 80 tr' },
      { name: 'React + Node/Nest', avg: 39, range: '22 - 70 tr' },
      { name: 'Vue + Laravel/Django', avg: 35, range: '18 - 60 tr' },
    ],
  },
  {
    key: 'backend',
    name: 'Backend Developer',
    shortName: 'Backend Dev',
    avgVnd: 36.5,
    minVnd: 18,
    maxVnd: 70,
    range: '18 - 70 triệu',
    jobCount: 51,
    techs: [
      { name: 'Golang', avg: 42, range: '25 - 75 tr' },
      { name: 'Java / Spring', avg: 38, range: '20 - 65 tr' },
      { name: 'Python / Django', avg: 36, range: '18 - 60 tr' },
      { name: 'Node.js / NestJS', avg: 34, range: '18 - 55 tr' },
      { name: '.NET / C#', avg: 33, range: '16 - 52 tr' },
    ],
  },
  {
    key: 'mobile',
    name: 'Mobile Developer (iOS/Android)',
    shortName: 'Mobile App',
    avgVnd: 33.0,
    minVnd: 16,
    maxVnd: 60,
    range: '16 - 60 triệu',
    jobCount: 16,
    techs: [
      { name: 'iOS (Swift)', avg: 36, range: '20 - 65 tr' },
      { name: 'Flutter', avg: 34, range: '18 - 60 tr' },
      { name: 'React Native', avg: 33, range: '18 - 58 tr' },
      { name: 'Android (Kotlin)', avg: 33, range: '17 - 58 tr' },
    ],
  },
  {
    key: 'product-ba',
    name: 'Product Owner / BA',
    shortName: 'Product & BA',
    avgVnd: 32.0,
    minVnd: 18,
    maxVnd: 60,
    range: '18 - 60 triệu',
    jobCount: 183,
    techs: [
      { name: 'Technical Product Manager', avg: 45, range: '28 - 85 tr' },
      { name: 'Product Owner', avg: 36, range: '22 - 65 tr' },
      { name: 'IT Business Analyst', avg: 28, range: '16 - 50 tr' },
    ],
  },
  {
    key: 'frontend',
    name: 'Frontend Developer',
    shortName: 'Frontend Dev',
    avgVnd: 30.5,
    minVnd: 15,
    maxVnd: 55,
    range: '15 - 55 triệu',
    jobCount: 15,
    techs: [
      { name: 'React / Next.js', avg: 34, range: '18 - 60 tr' },
      { name: 'TypeScript', avg: 32, range: '16 - 55 tr' },
      { name: 'Vue.js / Nuxt', avg: 30, range: '15 - 50 tr' },
      { name: 'Angular', avg: 29, range: '15 - 48 tr' },
    ],
  },
  {
    key: 'qa-qc',
    name: 'QA / QC / Automation Tester',
    shortName: 'QA / QC Tester',
    avgVnd: 24.5,
    minVnd: 12,
    maxVnd: 45,
    range: '12 - 45 triệu',
    jobCount: 110,
    techs: [
      { name: 'Automation Test (Selenium/Cypress)', avg: 28, range: '16 - 50 tr' },
      { name: 'Performance & API Testing', avg: 26, range: '15 - 45 tr' },
      { name: 'Manual QA / QC', avg: 18, range: '10 - 28 tr' },
    ],
  },
];

export async function GET() {
  try {
    // 1. Thử truy vấn từ bảng Gold Metrics đã tính toán sẵn (Server In-Memory Cache < 0.5ms)
    try {
      const goldRes = await queryCached(`SELECT total_jobs, levels, cities, top_companies, updated_at FROM gold_salary_benchmarks WHERE id = 1;`, [], 60);
      if (goldRes.rows.length > 0 && goldRes.rows[0].levels) {
        return NextResponse.json({
          totalJobs: goldRes.rows[0].total_jobs || 0,
          levels: goldRes.rows[0].levels,
          cities: goldRes.rows[0].cities,
          roles: IT_ROLES_BENCHMARKS,
          topCompanies: goldRes.rows[0].top_companies,
          updatedAt: goldRes.rows[0].updated_at || new Date().toISOString(),
        }, { headers: CACHE_HEADERS });
      }
    } catch (goldErr) {
      console.warn('Gold table query failed for salaries, falling back to live aggregation:', goldErr);
    }

    // 2. Fallback sang Live Query nếu bảng Gold chưa có dữ liệu
    const totalRes = await query(`SELECT COUNT(*) as count FROM all_jobs_unified;`);
    const totalJobs = parseInt(totalRes.rows[0]?.count || '0', 10);

    // 1. Phân tích mức lương theo cấp bậc (Level)
    const levelStats: SalaryLevelStat[] = [
      { level: 'Thực tập / Intern / Fresher', range: '5 - 12 triệu', avgVnd: 8.5, count: 0, description: 'Dành cho sinh viên mới ra trường hoặc dưới 1 năm kinh nghiệm' },
      { level: 'Nhân viên / Junior', range: '15 - 25 triệu', avgVnd: 20, count: 0, description: 'Từ 1 - 2 năm kinh nghiệm vững chắc' },
      { level: 'Chuyên viên / Middle', range: '25 - 40 triệu', avgVnd: 32.5, count: 0, description: 'Từ 2 - 4 năm kinh nghiệm độc lập' },
      { level: 'Kỹ sư Cấp cao / Senior', range: '40 - 65 triệu', avgVnd: 52.5, count: 0, description: 'Trên 5 năm kinh nghiệm, làm chủ hệ thống' },
      { level: 'Trưởng nhóm / Quản lý / Lead', range: '60 - 100+ triệu', avgVnd: 80, count: 0, description: 'Quản lý dự án, Tech Lead, Engineering Manager' },
    ];

    // Đếm số lượng theo level
    for (const lvl of levelStats) {
      const keyword = lvl.level.split('/')[0].trim();
      const res = await query(
        `SELECT COUNT(*) as count FROM all_jobs_unified WHERE level ILIKE $1 OR job_title ILIKE $1;`,
        [`%${keyword}%`]
      );
      lvl.count = parseInt(res.rows[0]?.count || '0', 10);
    }

    // 2. Mức lương theo thành phố
    const cityList = ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Toàn quốc / Remote'];
    const cityStats: SalaryCityStat[] = [];

    for (const city of cityList) {
      const searchKey = city === 'Hồ Chí Minh' ? 'Hồ Chí Minh' : city === 'Toàn quốc / Remote' ? 'Remote' : city;
      const res = await query(
        `SELECT COUNT(*) as count FROM all_jobs_unified WHERE location_short ILIKE $1;`,
        [`%${searchKey}%`]
      );
      const count = parseInt(res.rows[0]?.count || '0', 10);
      let avgVnd = 32;
      let range = '20 - 55 triệu';
      if (city === 'Hồ Chí Minh') {
        avgVnd = 35.5;
        range = '22 - 65 triệu';
      } else if (city === 'Đà Nẵng') {
        avgVnd = 26.5;
        range = '18 - 45 triệu';
      } else if (city.includes('Remote')) {
        avgVnd = 42;
        range = '25 - 80 triệu';
      }
      cityStats.push({ city, avgVnd, range, jobCount: count });
    }

    // 3. Top công ty tuyển dụng nhiều & có mức lương tốt
    const topCompaniesRes = await query(`
      SELECT company_name, COUNT(*) as job_count, 
        MAX(salary) as sample_salary,
        MAX(company_logo) as logo
      FROM all_jobs_unified
      WHERE company_name IS NOT NULL AND company_name != ''
      GROUP BY company_name
      ORDER BY job_count DESC
      LIMIT 8;
    `);

    return NextResponse.json({
      totalJobs,
      levels: levelStats,
      cities: cityStats,
      roles: IT_ROLES_BENCHMARKS,
      topCompanies: topCompaniesRes.rows,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('API /api/analytics/salaries error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate salary insights', details: error.message },
      { status: 500 }
    );
  }
}
