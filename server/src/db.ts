import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://care:care@localhost:5432/care_marketplace';

export const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

/** Applies schema.sql. Retries while Postgres is still booting (docker). */
export async function bootstrapDb(retries = 20): Promise<void> {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await pool.query(schema);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Database failed to become ready.');
}

export type Row = Record<string, unknown>;

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends Row = Row>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}