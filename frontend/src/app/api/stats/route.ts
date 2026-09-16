import { NextResponse } from 'next/server';
import { query, queryCached } from '@/lib/db';
import { StatsApiResponse, SourceStat, LocationStat, UnifiedJob } from '@/types/job';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

const KNOWN_SOURCES = [
  'careerlink',
  'careerviet',
  'topcv',
  'vieclam24h',
  'vietnamworks',
  'jobsgo',
  'joboko',
  'timviec365',
  'topdev',
];

export async function GET() {
  try {
    // 1. Thử truy vấn từ bảng Gold Metrics đã tính toán sẵn (Server In-Memory Cache < 0.5ms)
    try {
      const goldRes = await queryCached(`
        SELECT data, updated_at 
        FROM gold_dashboard_metrics 
        WHERE id = 1;
      `, [], 60);
      if (goldRes.rows.length > 0 && goldRes.rows[0].data) {
        const rowData = goldRes.rows[0].data;
        const response: StatsApiResponse = {
          totalUnified: rowData.totalUnified || 0,
          totalRawJobs: rowData.totalRawJobs || 0,
          totalDuplicatesDetected: rowData.totalDuplicatesDetected || 0,
          totalCompanies: rowData.totalCompanies || 0,
          sources: rowData.sources || [],
          topLocations: rowData.topLocations || [],
          provinces: rowData.provinces || [],
          topHiringCompanies: rowData.topHiringCompanies || [],
          latestJobs: rowData.latestJobs || [],
          lastCrawledAt: rowData.lastCrawledAt || goldRes.rows[0].updated_at || new Date().toISOString(),
        };
        return NextResponse.json(response, { headers: CACHE_HEADERS });
      }
    } catch (goldErr) {
      console.warn('Gold table query failed, falling back to live aggregation:', goldErr);
    }

    // 2. Fallback sang Live Query nếu bảng Gold chưa có dữ liệu
    // 2.1. Tổng số job trong all_jobs_unified
    const totalUnifiedRes = await query(
      `SELECT COUNT(*) as count FROM all_jobs_unified;`
    );
    const totalUnified = parseInt(totalUnifiedRes.rows[0]?.count || '0', 10);

    // 2.2. Số job phân bổ theo nguồn trong all_jobs_unified
    const unifiedBySourceRes = await query(`
      SELECT source, COUNT(*) as count 
      FROM all_jobs_unified 
      GROUP BY source;
    `);
    const unifiedBySourceMap: Record<string, number> = {};
    unifiedBySourceRes.rows.forEach((r: any) => {
      if (r.source) unifiedBySourceMap[r.source.toLowerCase()] = parseInt(r.count, 10);
    });

    // 2.3. Đếm số bản ghi raw trong từng bảng riêng jobs_<source>
    const sourcesStats: SourceStat[] = [];
    for (const src of KNOWN_SOURCES) {
      let rawCount = 0;
      try {
        const rawRes = await query(`SELECT COUNT(*) as count FROM jobs_${src};`);
        rawCount = parseInt(rawRes.rows[0]?.count || '0', 10);
      } catch {
        rawCount = unifiedBySourceMap[src] || 0;
      }
      sourcesStats.push({
        source: src,
        rawCount,
        unifiedCount: unifiedBySourceMap[src] || 0,
      });
    }

    // 2.4. Đếm số lượng job có trùng lặp được gộp
    let totalDuplicates = 0;
    try {
      const dupRes = await query(`
        SELECT COUNT(*) as count 
        FROM all_jobs_unified 
        WHERE extra_info->'duplicate_sources' IS NOT NULL 
          AND jsonb_array_length(extra_info->'duplicate_sources') > 0;
      `);
      totalDuplicates = parseInt(dupRes.rows[0]?.count || '0', 10);
    } catch {
      totalDuplicates = 0;
    }

    // 2.5. Thống kê top địa điểm và tỉnh thành
    const topLocationsRes = await query(`
      SELECT 
        COALESCE(NULLIF(TRIM(location_short), ''), 'Khác / Chưa rõ') as location,
        COUNT(*) as count
      FROM all_jobs_unified
      GROUP BY location
      ORDER BY count DESC
      LIMIT 8;
    `);
    const topLocations: LocationStat[] = topLocationsRes.rows.map((r: any) => ({
      location: r.location,
      count: parseInt(r.count, 10),
    }));

    // 2.6. Thống kê theo 63 tỉnh thành cho bản đồ Việt Nam
    const provincesRes = await query(`
      SELECT 
        COALESCE(NULLIF(TRIM(location_short), ''), 'Khác / Chưa rõ') as province,
        COUNT(*) as job_count,
        COUNT(DISTINCT company_name) as company_count
      FROM all_jobs_unified
      GROUP BY province
      ORDER BY job_count DESC
      LIMIT 40;
    `);
    const provinces: any[] = provincesRes.rows.map((r: any) => ({
      province: r.province,
      jobCount: parseInt(r.job_count, 10),
      companyCount: parseInt(r.company_count, 10),
      percentage: totalUnified > 0 ? parseFloat(((parseInt(r.job_count, 10) / totalUnified) * 100).toFixed(1)) : 0,
    }));

    // 2.7. Top 15 Doanh nghiệp tuyển dụng
    const topCompaniesRes = await query(`
      SELECT 
        company_name, 
        COUNT(*) as job_count,
        MAX(company_logo) as logo
      FROM all_jobs_unified
      WHERE company_name IS NOT NULL AND company_name != ''
      GROUP BY company_name
      ORDER BY job_count DESC
      LIMIT 15;
    `);
    const topHiringCompanies = topCompaniesRes.rows.map((r: any) => ({
      company_name: r.company_name,
      job_count: parseInt(r.job_count, 10),
      logo: r.logo,
    }));

    // 2.8. 6 tin tuyển dụng mới nhất
    const latestJobsRes = await query(`
      SELECT *
      FROM all_jobs_unified
      ORDER BY created_at DESC
      LIMIT 6;
    `);
    const latestJobs: UnifiedJob[] = latestJobsRes.rows;

    const response: StatsApiResponse = {
      totalUnified,
      totalDuplicatesDetected: totalDuplicates,
      sources: sourcesStats,
      topLocations,
      provinces,
      topHiringCompanies,
      latestJobs,
      lastCrawledAt: latestJobs[0]?.created_at || new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('API /api/stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics from Supabase', details: error.message },
      { status: 500 }
    );
  }
}
