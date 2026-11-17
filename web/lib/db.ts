import { Pool } from 'pg';

export const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/prooftrail';

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export const pool =
  global._pgPool ||
  new Pool({
    connectionString: DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') {
  global._pgPool = pool;
}

export default pool;
