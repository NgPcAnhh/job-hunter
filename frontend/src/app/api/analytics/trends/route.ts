import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { TechTrendItem } from '@/types/job';

export const dynamic = 'force-dynamic';

const TECH_LIST: { name: string; category: TechTrendItem['category']; pattern: string; avgSalary: string; badge: TechTrendItem['badge'] }[] = [
  { name: 'React / Next.js', category: 'Framework', pattern: 'React|Next.?js', avgSalary: '25 - 45 tr', badge: 'Hot 🔥' },
  { name: 'Python / AI / ML', category: 'Language', pattern: 'Python|Django|FastAPI|PyTorch', avgSalary: '30 - 60 tr', badge: 'Hot 🔥' },
  { name: 'Java / Spring Boot', category: 'Language', pattern: 'Java|Spring', avgSalary: '28 - 50 tr', badge: 'Phổ biến ⚡' },
  { name: 'Golang', category: 'Language', pattern: 'Go|Golang', avgSalary: '35 - 65 tr', badge: 'Tăng trưởng ↗️' },
  { name: 'TypeScript / Node.js', category: 'Language', pattern: 'TypeScript|Node.?js|Express', avgSalary: '25 - 45 tr', badge: 'Phổ biến ⚡' },
  { name: 'Automation Test / QA', category: 'Tool', pattern: 'Test|QA|QC|Selenium|Appium|Cypress', avgSalary: '20 - 40 tr', badge: 'Hot 🔥' },
  { name: 'Docker / Kubernetes / DevOps', category: 'Database/Cloud', pattern: 'Docker|Kubernetes|DevOps|CI.?CD', avgSalary: '35 - 70 tr', badge: 'Tăng trưởng ↗️' },
  { name: 'AWS / Cloud Computing', category: 'Database/Cloud', pattern: 'AWS|Azure|GCP|Cloud', avgSalary: '32 - 60 tr', badge: 'Tăng trưởng ↗️' },
  { name: 'PostgreSQL / SQL / Database', category: 'Database/Cloud', pattern: 'Postgres|SQL|MySQL|Database', avgSalary: '25 - 45 tr', badge: 'Phổ biến ⚡' },
  { name: 'Flutter / Mobile', category: 'Framework', pattern: 'Flutter|React Native|iOS|Android|Mobile', avgSalary: '22 - 42 tr', badge: 'Phổ biến ⚡' },
  { name: '.NET / C#', category: 'Language', pattern: '\\.NET|C#', avgSalary: '25 - 48 tr', badge: 'Phổ biến ⚡' },
  { name: 'Vue.js / Nuxt', category: 'Framework', pattern: 'Vue|Nuxt', avgSalary: '22 - 38 tr', badge: 'Phổ biến ⚡' },
];

export async function GET() {
  try {
    // 1. Thử truy vấn từ bảng Gold Metrics đã tính toán sẵn (cực nhanh < 10ms)
    try {
      const goldRes = await query(`SELECT total_jobs, trends, updated_at FROM gold_skill_trends WHERE id = 1;`);
      if (goldRes.rows.length > 0 && goldRes.rows[0].trends) {
        return NextResponse.json({
          totalJobs: goldRes.rows[0].total_jobs || 0,
          trends: goldRes.rows[0].trends,
          updatedAt: goldRes.rows[0].updated_at || new Date().toISOString(),
        });
      }
    } catch (goldErr) {
      console.warn('Gold table query failed for trends, falling back to live aggregation:', goldErr);
    }

    // 2. Fallback sang Live Query nếu bảng Gold chưa có dữ liệu
    const totalRes = await query(`SELECT COUNT(*) as count FROM all_jobs_unified;`);
    const totalJobs = Math.max(1, parseInt(totalRes.rows[0]?.count || '1', 10));

    const trends: TechTrendItem[] = [];

    for (const tech of TECH_LIST) {
      const sql = `
        SELECT COUNT(*) as count 
        FROM all_jobs_unified 
        WHERE job_title ~* $1 
           OR job_requirements ~* $1 
           OR job_description ~* $1 
           OR keyword ~* $1;
      `;
      const res = await query(sql, [tech.pattern]);
      const count = parseInt(res.rows[0]?.count || '0', 10);
      const sharePercent = Math.min(100, Math.round((count / totalJobs) * 100));

      trends.push({
        name: tech.name,
        category: tech.category,
        count,
        sharePercent,
        avgSalaryEstimate: tech.avgSalary,
        badge: tech.badge,
      });
    }

    // Sắp xếp theo số lượng jobs giảm dần
    trends.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      totalJobs,
      trends,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('API /api/analytics/trends error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate tech trends', details: error.message },
      { status: 500 }
    );
  }
}
