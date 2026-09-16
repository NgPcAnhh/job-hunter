import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { SalaryLevelStat, SalaryCityStat } from '@/types/job';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Thử truy vấn từ bảng Gold Metrics đã tính toán sẵn (cực nhanh < 10ms)
    try {
      const goldRes = await query(`SELECT total_jobs, levels, cities, top_companies, updated_at FROM gold_salary_benchmarks WHERE id = 1;`);
      if (goldRes.rows.length > 0 && goldRes.rows[0].levels) {
        return NextResponse.json({
          totalJobs: goldRes.rows[0].total_jobs || 0,
          levels: goldRes.rows[0].levels,
          cities: goldRes.rows[0].cities,
          topCompanies: goldRes.rows[0].top_companies,
          updatedAt: goldRes.rows[0].updated_at || new Date().toISOString(),
        });
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
