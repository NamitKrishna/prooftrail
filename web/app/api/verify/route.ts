import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const chainRes = await pool.query(
      'SELECT bad_seq, problem FROM verify_chain() ORDER BY bad_seq ASC;'
    );
    const liveRes = await pool.query(
      'SELECT disb_id, problem FROM verify_live ORDER BY disb_id ASC;'
    );

    return NextResponse.json({
      chain: chainRes.rows,
      live: liveRes.rows,
    });
  } catch (error: any) {
    console.error('Error running verification queries:', error);
    return NextResponse.json(
      { error: error.message || 'Verification query failed' },
      { status: 500 }
    );
  }
}
