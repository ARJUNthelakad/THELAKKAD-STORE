import { Pool, neonConfig } from '@neondatabase/serverless';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface DatabaseClient extends SqlExecutor {
  withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export class DatabaseConfigError extends Error {
  status = 503;

  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

export function getDatabaseUrl(): string | null {
  const url = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();
  if (!url || url === 'MY_DATABASE_URL') {
    return null;
  }
  return url;
}

export function isNeonConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

export function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1' || process.env.VERCEL === 'true';
}

let cachedPool: Pool | null = null;
let cachedUrl: string | null = null;

function getPool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new DatabaseConfigError(
      'DATABASE_URL is not configured. Connect your Neon PostgreSQL database in Vercel Environment Variables.'
    );
  }

  if (cachedPool && cachedUrl === connectionString) {
    return cachedPool;
  }

  // Use low-latency HTTP fetch for single queries in serverless environments
  // while keeping WebSockets available for pool.connect() ACID transactions.
  neonConfig.poolQueryViaFetch = true;

  cachedPool = new Pool({
    connectionString,
    max: isVercelRuntime() ? 5 : 10,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 10_000,
  });

  cachedPool.on('error', (err) => {
    console.error('[neon] Idle pool error:', err instanceof Error ? err.message : err);
  });

  cachedUrl = connectionString;
  return cachedPool;
}

export function getNeonClient(): DatabaseClient {
  const pool = getPool();
  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const result = await pool.query(text, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount,
      };
    },
    async withTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: SqlExecutor = {
          async query<R = Record<string, unknown>>(
            text: string,
            params?: unknown[]
          ): Promise<QueryResult<R>> {
            const result = await client.query(text, params);
            return {
              rows: result.rows as R[],
              rowCount: result.rowCount,
            };
          },
        };
        const output = await fn(tx);
        await client.query('COMMIT');
        return output;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error(
            '[neon] Transaction rollback failed:',
            rollbackErr instanceof Error ? rollbackErr.message : rollbackErr
          );
        }
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export async function closeNeonPool(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
    cachedUrl = null;
  }
}

export async function checkDatabaseHealth(): Promise<{ ok: boolean; driver: 'neon' | 'local'; error?: string }> {
  if (!isNeonConfigured()) {
    if (isVercelRuntime()) {
      return {
        ok: false,
        driver: 'neon',
        error: 'DATABASE_URL environment variable is missing.',
      };
    }
    return { ok: true, driver: 'local' };
  }

  try {
    const db = getNeonClient();
    await db.query('SELECT 1 AS ok');
    return { ok: true, driver: 'neon' };
  } catch (err) {
    return {
      ok: false,
      driver: 'neon',
      error: err instanceof Error ? err.message : 'Database health check failed.',
    };
  }
}
