import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { DATABASE_URL } from '@/lib/db';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const sqlPath = path.resolve(process.cwd(), '../db/01_core.sql');
    const env = {
      ...process.env,
      PATH: `/home/namit/.local/bin:${process.env.PATH || ''}`,
      LD_LIBRARY_PATH: `/home/namit/.local/lib:${process.env.LD_LIBRARY_PATH || ''}`,
    };

    const cmd = `psql "${DATABASE_URL}" -f "${sqlPath}"`;
    const { stdout, stderr } = await execAsync(cmd, { env });

    return NextResponse.json({
      success: true,
      message: 'Database reset to clean 01_core.sql state',
      stdout,
      stderr,
    });
  } catch (error: any) {
    console.error('Error in /api/demo/reset:', error);
    return NextResponse.json(
      {
        error: error.message || 'Database reset failed',
        details: error.stderr || error.stdout,
      },
      { status: 500 }
    );
  }
}
