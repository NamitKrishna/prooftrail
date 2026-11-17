import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  const client = await pool.connect();
  try {
    await client.query('ALTER TABLE disbursement DISABLE TRIGGER trg_log;');
    const updateRes = await client.query('UPDATE disbursement SET amount = 1 WHERE disb_id = 2 RETURNING *;');
    await client.query('ALTER TABLE disbursement ENABLE TRIGGER trg_log;');

    return NextResponse.json({
      success: true,
      message: 'Tampered disbursement row disb_id = 2 (amount set to 1 bypassing trigger)',
      updated: updateRes.rows[0],
    });
  } catch (error: any) {
    try {
      await client.query('ALTER TABLE disbursement ENABLE TRIGGER trg_log;');
    } catch {
      // ignore rollback/re-enable error
    }
    console.error('Error tampering database:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to tamper data' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
