import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        d.disb_id,
        d.scheme_id,
        s.name AS scheme_name,
        s.department,
        d.beneficiary_id,
        b.full_name AS beneficiary_name,
        b.district,
        d.amount,
        d.disbursed_on,
        d.officer
      FROM disbursement d
      JOIN scheme s ON d.scheme_id = s.scheme_id
      JOIN beneficiary b ON d.beneficiary_id = b.beneficiary_id
      ORDER BY d.disb_id ASC;
    `);

    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching disbursements:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch disbursements' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scheme_id, beneficiary_id, amount, officer } = body;

    if (!scheme_id || !beneficiary_id || amount === undefined || !officer) {
      return NextResponse.json(
        { error: 'Missing required fields: scheme_id, beneficiary_id, amount, officer' },
        { status: 400 }
      );
    }

    const numSchemeId = parseInt(scheme_id, 10);
    const numBeneficiaryId = parseInt(beneficiary_id, 10);
    const numAmount = parseFloat(amount);
    const strOfficer = String(officer).trim();

    if (isNaN(numSchemeId) || isNaN(numBeneficiaryId) || isNaN(numAmount) || numAmount <= 0 || !strOfficer) {
      return NextResponse.json(
        { error: 'Invalid field values: amount must be > 0, ids must be integers, officer cannot be empty' },
        { status: 400 }
      );
    }

    const insertQuery = `
      INSERT INTO disbursement (scheme_id, beneficiary_id, amount, officer)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      numSchemeId,
      numBeneficiaryId,
      numAmount,
      strOfficer,
    ]);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: any) {
    console.error('Error inserting disbursement:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to insert disbursement' },
      { status: 500 }
    );
  }
}
