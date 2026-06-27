type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

let poolPromise: Promise<Queryable> | undefined;

export async function db(): Promise<Queryable> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Supabase Postgres access.");
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("supabase") ? { rejectUnauthorized: false } : undefined }));
  }
  return poolPromise;
}

export async function query<T = any>(text: string, params: unknown[] = []) {
  const client = await db();
  return client.query(text, params) as Promise<{ rows: T[]; rowCount: number | null }>;
}
