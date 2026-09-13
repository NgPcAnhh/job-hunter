import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { StatsApiResponse, SourceStat, LocationStat, UnifiedJob } from '@/types/job';

export const dynamic = 'force-dynamic';

const KNOWN_SOURCES = [
  'careerlink',
  'careerviet',
  'topcv',
  'vieclam24h',
  'vietnamworks',
  'jobsgo',
  'joboko',
];

export async function GET() {
  try {
    // 1. Tổng số job trong all_jobs_unified
    const totalUnifiedRes = await query(
      `SELECT COUNT(*) as count FROM all_jobs_unified;`
    );
    const totalUnified = parseInt(totalUnifiedRes.rows[0]?.count || '0', 10);

    // 2. Số job phân bổ theo nguồn trong all_jobs_unified
    const unifiedBySourceRes = await query(`
      SELECT source, COUNT(*) as count 
      FROM all_jobs_unified 
      GROUP BY source;
    `);
    const unifiedBySourceMap: Record<string, number> = {};
    unifiedBySourceRes.rows.forEach((r: any) => {
      if (r.source) unifiedBySourceMap[r.source.toLowerCase()] = parseInt(r.count, 10);
    });

    // 3. Đếm số bản ghi raw trong từng bảng riêng jobs_<source>
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

    // 4. Đếm số lượng job có trùng lặp được gộp
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

    // 5. Thống kê top địa điểm
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

    // 6. 6 tin tuyển dụng mới nhất
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
