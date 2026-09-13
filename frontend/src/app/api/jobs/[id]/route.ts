import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { UnifiedJob } from '@/types/job';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const decodedUrl = decodeURIComponent(id);

    // Tìm theo job_url chính xác hoặc URL giải mã
    const res = await query(
      `SELECT * FROM all_jobs_unified WHERE job_url = $1 OR job_url = $2 LIMIT 1;`,
      [id, decodedUrl]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job: UnifiedJob = res.rows[0];
    return NextResponse.json(job);
  } catch (error: any) {
    console.error('API /api/jobs/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve job details', details: error.message },
      { status: 500 }
    );
  }
}
