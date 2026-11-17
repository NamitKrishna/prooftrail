import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const schemesRes = await pool.query(
      'SELECT scheme_id, name, department FROM scheme ORDER BY scheme_id ASC;'
    );
    const benRes = await pool.query(
      'SELECT beneficiary_id, full_name, district FROM beneficiary ORDER BY beneficiary_id ASC;'
    );

    return NextResponse.json({
      schemes: schemesRes.rows,
      beneficiaries: benRes.rows,
    });
  } catch (error: any) {
    console.error('Error fetching meta data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch meta data' },
      { status: 500 }
    );
  }
}
