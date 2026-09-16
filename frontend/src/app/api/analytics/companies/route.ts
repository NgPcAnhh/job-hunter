import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { CompanyOverviewItem, IndustrySectorItem } from '@/types/job';

export const dynamic = 'force-dynamic';

function inferIndustrySector(company: string, title: string, req: string): string {
  const text = `${company} ${title} ${req}`.toLowerCase();
  if (text.includes('bank') || text.includes('ngân hàng') || text.includes('fintech') || text.includes('chứng khoán') || text.includes('thanh toán') || text.includes('ví điện tử')) {
    return 'Fintech & Ngân hàng';
  }
  if (text.includes('fpt') || text.includes('viettel') || text.includes('vnpt') || text.includes('viễn thông')) {
    return 'Tập đoàn Công nghệ & Viễn thông';
  }
  if (text.includes('shopee') || text.includes('tiki') || text.includes('lazada') || text.includes('thương mại') || text.includes('retail') || text.includes('e-commerce')) {
    return 'Thương Mại Điện Tử & Bán Lẻ';
  }
  if (text.includes('game') || text.includes('unity') || text.includes('vng')) {
    return 'Game & Giải Trí Trực Tuyến';
  }
  if (text.includes('outsource') || text.includes('solution') || text.includes('software') || text.includes('phần mềm') || text.includes('global') || text.includes('tech')) {
    return 'Phần Mềm & Outsourcing';
  }
  return 'Công Nghệ Thông Tin Khác';
}

export async function GET() {
  try {
    // 1. Thử truy vấn từ bảng Gold Metrics đã tính toán sẵn (cực nhanh < 10ms)
    try {
      const goldRes = await query(`SELECT total_companies, total_jobs, companies, sectors, updated_at FROM gold_company_stats WHERE id = 1;`);
      if (goldRes.rows.length > 0 && goldRes.rows[0].companies) {
        return NextResponse.json({
          totalCompanies: goldRes.rows[0].total_companies || 0,
          totalJobs: goldRes.rows[0].total_jobs || 0,
          companies: goldRes.rows[0].companies,
          sectors: goldRes.rows[0].sectors,
          updatedAt: goldRes.rows[0].updated_at || new Date().toISOString(),
        });
      }
    } catch (goldErr) {
      console.warn('Gold table query failed for companies, falling back to live aggregation:', goldErr);
    }

    // 2. Fallback sang Live Query nếu bảng Gold chưa có dữ liệu
    const totalRes = await query(`SELECT COUNT(*) as count FROM all_jobs_unified;`);
    const totalJobs = Math.max(1, parseInt(totalRes.rows[0]?.count || '1', 10));

    // 1. Group by Company
    const companiesRes = await query(`
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
    `);

    const sectorCounts: Record<string, { count: number; companies: Set<string> }> = {};

    const companies: CompanyOverviewItem[] = companiesRes.rows.map((row: any) => {
      const titles = (row.titles || []).slice(0, 3);
      const sector = inferIndustrySector(row.company_name, titles.join(' '), row.sample_req || '');

      if (!sectorCounts[sector]) {
        sectorCounts[sector] = { count: 0, companies: new Set() };
      }
      sectorCounts[sector].count += parseInt(row.job_count, 10);
      sectorCounts[sector].companies.add(row.company_name);

      return {
        company_name: row.company_name,
        company_logo: row.company_logo,
        company_url: row.company_url,
        job_count: parseInt(row.job_count, 10),
        locations: (row.locations || []).slice(0, 3),
        sample_titles: titles,
        sample_salary: row.sample_salary,
        industry_sector: sector,
      };
    });

    // 2. Format Sector breakdown
    const sectors: IndustrySectorItem[] = Object.entries(sectorCounts).map(([sector, val]) => ({
      sector,
      count: val.count,
      percentage: Math.round((val.count / totalJobs) * 100),
      topCompanies: Array.from(val.companies).slice(0, 4),
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      totalCompanies: companies.length,
      totalJobs,
      companies,
      sectors,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('API /api/analytics/companies error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate companies data', details: error.message },
      { status: 500 }
    );
  }
}
