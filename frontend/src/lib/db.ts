import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_POOLER_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:phucanhnguyen04082004@db.xltonipyxbdivoljvemc.supabase.co:5432/postgres';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

let pool: Pool;

if (process.env.NODE_ENV === 'production') {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
} else {
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  pool = global.__pgPool;
}

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export default pool;
