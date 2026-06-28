type QueryResult = { rows: any[]; rowCount: number | null };
type Queryable = { query: (text: string, params?: unknown[]) => Promise<QueryResult> };
type PoolLike = Queryable & { connect?: () => Promise<Queryable & { release: () => void }> };

let poolPromise: Promise<PoolLike> | undefined;

export async function db(): Promise<PoolLike> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Supabase Postgres access.");
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("supabase") || process.env.DATABASE_URL?.includes("neon") ? { rejectUnauthorized: false } : undefined }) as PoolLike);
  }
  return poolPromise;
}

export async function query<T = any>(text: string, params: unknown[] = []) {
  const client = await db();
  return client.query(text, params) as Promise<{ rows: T[]; rowCount: number | null }>;
}

export async function transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
  const pool = await db();
  if (!pool.connect) throw new Error("Database client does not support transactions.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
