import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { JobsApiResponse, UnifiedJob } from '@/types/job';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim() || '';
    const source = searchParams.get('source')?.trim() || '';
    const location = searchParams.get('location')?.trim() || '';
    const level = searchParams.get('level')?.trim() || '';
    const experience = searchParams.get('experience')?.trim() || '';
    const workType = searchParams.get('workType')?.trim() || '';
    const sortBy = searchParams.get('sortBy') || 'latest';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '12', 10)));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = ['1=1'];
    const values: any[] = [];

    // 1. Search full-text across job_title, company_name, description, requirements, keyword
    if (q) {
      values.push(`%${q}%`);
      const idx = values.length;
      whereClauses.push(`(
        job_title ILIKE $${idx} OR 
        company_name ILIKE $${idx} OR 
        keyword ILIKE $${idx} OR 
        location_short ILIKE $${idx} OR
        job_requirements ILIKE $${idx} OR
        job_description ILIKE $${idx}
      )`);
    }

    // 2. Filter by source (supports comma-separated or single)
    if (source && source !== 'all') {
      const sources = source.split(',').map((s) => s.trim().toLowerCase());
      values.push(sources);
      whereClauses.push(`LOWER(source) = ANY($${values.length})`);
    }

    // 3. Filter by location
    if (location && location !== 'all') {
      values.push(`%${location}%`);
      whereClauses.push(`location_short ILIKE $${values.length}`);
    }

    // 4. Filter by level
    if (level && level !== 'all') {
      values.push(`%${level}%`);
      whereClauses.push(`level ILIKE $${values.length}`);
    }

    // 5. Filter by experience
    if (experience && experience !== 'all') {
      values.push(`%${experience}%`);
      whereClauses.push(`experience ILIKE $${values.length}`);
    }

    // 6. Filter by work_type
    if (workType && workType !== 'all') {
      values.push(`%${workType}%`);
      whereClauses.push(`work_type ILIKE $${values.length}`);
    }

    const whereSql = whereClauses.join(' AND ');

    // Sắp xếp
    let orderBySql = 'created_at DESC';
    if (sortBy === 'deadline') {
      orderBySql = 'deadline ASC NULLS LAST, created_at DESC';
    } else if (sortBy === 'title') {
      orderBySql = 'job_title ASC';
    }

    // Đếm tổng số bản ghi thỏa điều kiện
    const countSql = `SELECT COUNT(*) as count FROM all_jobs_unified WHERE ${whereSql};`;
    const countRes = await query(countSql, values);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);
    const totalPages = Math.ceil(total / limit);

    // Lấy dữ liệu trang hiện tại
    const dataValues = [...values, limit, offset];
    const dataSql = `
      SELECT * 
      FROM all_jobs_unified 
      WHERE ${whereSql} 
      ORDER BY ${orderBySql} 
      LIMIT $${values.length + 1} OFFSET $${values.length + 2};
    `;
    const dataRes = await query(dataSql, dataValues);
    const jobs: UnifiedJob[] = dataRes.rows;

    // Lấy danh sách các bộ lọc có sẵn (Facet aggregations)
    const sourcesFacetRes = await query(`
      SELECT source, COUNT(*) as count 
      FROM all_jobs_unified 
      WHERE source IS NOT NULL AND source != ''
      GROUP BY source 
      ORDER BY count DESC;
    `);

    const locationsFacetRes = await query(`
      SELECT location_short as location, COUNT(*) as count 
      FROM all_jobs_unified 
      WHERE location_short IS NOT NULL AND location_short != ''
      GROUP BY location_short 
      ORDER BY count DESC 
      LIMIT 10;
    `);

    const levelsFacetRes = await query(`
      SELECT level, COUNT(*) as count 
      FROM all_jobs_unified 
      WHERE level IS NOT NULL AND level != ''
      GROUP BY level 
      ORDER BY count DESC 
      LIMIT 10;
    `);

    const response: JobsApiResponse = {
      jobs,
      total,
      page,
      limit,
      totalPages,
      filtersAvailable: {
        sources: sourcesFacetRes.rows.map((r: any) => ({
          source: r.source,
          count: parseInt(r.count, 10),
        })),
        locations: locationsFacetRes.rows.map((r: any) => ({
          location: r.location,
          count: parseInt(r.count, 10),
        })),
        levels: levelsFacetRes.rows.map((r: any) => ({
          level: r.level,
          count: parseInt(r.count, 10),
        })),
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('API /api/jobs error:', error);
    return NextResponse.json(
      { error: 'Failed to query jobs from Supabase', details: error.message },
      { status: 500 }
    );
  }
}
