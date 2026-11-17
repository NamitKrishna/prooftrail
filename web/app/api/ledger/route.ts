import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        seq,
        op,
        payload,
        created_at,
        encode(prev_hash, 'hex') AS prev_hash,
        encode(row_hash, 'hex') AS row_hash
      FROM ledger
      ORDER BY seq ASC;
    `);

    // Ensure row_hash and prev_hash are hex strings
    const rows = result.rows.map((row) => ({
      ...row,
      seq: Number(row.seq),
      prev_hash: typeof row.prev_hash === 'string'
        ? row.prev_hash
        : Buffer.isBuffer(row.prev_hash)
        ? row.prev_hash.toString('hex')
        : String(row.prev_hash),
      row_hash: typeof row.row_hash === 'string'
        ? row.row_hash
        : Buffer.isBuffer(row.row_hash)
        ? row.row_hash.toString('hex')
        : String(row.row_hash),
    }));

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('Error fetching ledger:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ledger' },
      { status: 500 }
    );
  }
}
