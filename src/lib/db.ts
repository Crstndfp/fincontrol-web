import { Pool, QueryResultRow } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://fincontrol:fincontrol_secret_2026@localhost:5432/fincontrol_db";

declare global {
  // eslint-disable-next-line no-var
  var __fincontrolPool: Pool | undefined;
}

export const dbPool: Pool =
  global.__fincontrolPool ||
  new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__fincontrolPool = dbPool;
}

export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await dbPool.query<T>(text, params);
  return res.rows;
}
