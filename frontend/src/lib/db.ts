import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_POOLER_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres.xltonipyxbdivoljvemc:phucanhnguyen04082004@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

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

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

export async function queryCached(text: string, params?: any[], ttlSeconds: number = 60) {
  const cacheKey = `${text}::${JSON.stringify(params || [])}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const result = await query(text, params);
  memoryCache.set(cacheKey, {
    data: result,
    expiresAt: now + ttlSeconds * 1000,
  });

  // Keep cache size bounded to prevent memory leaks
  if (memoryCache.size > 200) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }

  return result;
}

export default pool;
