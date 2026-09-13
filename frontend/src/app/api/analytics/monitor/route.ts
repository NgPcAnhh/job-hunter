import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { PipelineMonitorData, PipelineSpiderStatus } from '@/types/job';

export const dynamic = 'force-dynamic';

const SPIDER_CONFIGS: { source: string; name: string; engine: PipelineSpiderStatus['engine'] }[] = [
  { source: 'topcv', name: 'TopCV Vietnam', engine: 'curl_cffi' },
  { source: 'vietnamworks', name: 'VietnamWorks', engine: 'playwright' },
  { source: 'careerlink', name: 'CareerLink VN', engine: 'requests' },
  { source: 'careerviet', name: 'CareerViet (CareerBuilder)', engine: 'requests' },
  { source: 'jobsgo', name: 'JobsGO', engine: 'requests' },
  { source: 'vieclam24h', name: 'Việc Làm 24h', engine: 'requests' },
  { source: 'joboko', name: 'Joboko', engine: 'requests' },
];

export async function GET() {
  try {
    let totalRawScraped = 0;
    const spiders: PipelineSpiderStatus[] = [];

    // 1. Kiểm tra từng bảng con jobs_<source>
    for (const cfg of SPIDER_CONFIGS) {
      const rawTable = `jobs_${cfg.source}`;
      let rawCount = 0;
      let unifiedCount = 0;

      try {
        const rawRes = await query(`SELECT COUNT(*) as count FROM ${rawTable};`);
        rawCount = parseInt(rawRes.rows[0]?.count || '0', 10);
      } catch {
        rawCount = 0;
      }

      try {
        const unifiedRes = await query(
          `SELECT COUNT(*) as count FROM all_jobs_unified WHERE LOWER(source) = $1;`,
          [cfg.source]
        );
        unifiedCount = parseInt(unifiedRes.rows[0]?.count || '0', 10);
      } catch {
        unifiedCount = 0;
      }

      totalRawScraped += rawCount;
      const dedupRatio = rawCount > 0 ? Math.round(((rawCount - unifiedCount) / rawCount) * 100) : 0;

      spiders.push({
        source: cfg.source,
        displayName: cfg.name,
        status: rawCount > 0 ? 'ACTIVE' : 'IDLE',
        rawTable,
        rawCount,
        unifiedCount,
        dedupRatio: Math.max(0, dedupRatio),
        lastRun: '12:00 & 00:00 (Hàng ngày)',
        engine: cfg.engine,
      });
    }

    // 2. Thống kê bảng tổng all_jobs_unified
    const totalUnifiedRes = await query(`SELECT COUNT(*) as count FROM all_jobs_unified;`);
    const totalUnifiedSaved = parseInt(totalUnifiedRes.rows[0]?.count || '0', 10);

    // 3. Số lượng tin trùng lặp đã gộp
    let totalDuplicatesMerged = 0;
    try {
      const dupRes = await query(`
        SELECT COUNT(*) as count 
        FROM all_jobs_unified 
        WHERE extra_info->'duplicate_sources' IS NOT NULL 
          AND jsonb_array_length(extra_info->'duplicate_sources') > 0;
      `);
      totalDuplicatesMerged = parseInt(dupRes.rows[0]?.count || '0', 10);
    } catch {
      totalDuplicatesMerged = 0;
    }

    const overallDedupPercent = totalRawScraped > 0
      ? Math.round(((totalRawScraped - totalUnifiedSaved) / totalRawScraped) * 100)
      : 0;

    const data: PipelineMonitorData = {
      totalRawScraped,
      totalUnifiedSaved,
      totalDuplicatesMerged,
      overallDedupPercent: Math.max(0, overallDedupPercent),
      spiders,
      cronSchedule: {
        expression: '0 5,17 * * * (UTC)',
        scheduleDescription: 'Chạy tự động 2 lần mỗi ngày lúc 12:00 trưa và 24:00 đêm (GMT+7)',
        parallelWorkers: 3,
        alertChannel: 'Telegram Bot Alert (ID: 6204378947)',
      },
    };

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/analytics/monitor error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve monitor data', details: error.message },
      { status: 500 }
    );
  }
}
