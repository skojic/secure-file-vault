// Helpers for tests that need a database of their own (migration tests) or raw SQL access.
import { randomUUID } from "node:crypto";
import { Client } from "pg";

export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see vitest.config.mts)");
  return url;
}

// Same server and credentials, different database name.
export function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export async function adminQuery<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: withDatabase(testDatabaseUrl(), "postgres") });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function createScratchDatabase(): Promise<{ name: string; url: string; drop: () => Promise<void> }> {
  const name = `vault_scratch_${randomUUID().replaceAll("-", "")}`;
  await adminQuery(`CREATE DATABASE "${name}"`);
  return {
    name,
    url: withDatabase(testDatabaseUrl(), name),
    drop: async () => {
      await adminQuery(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    },
  };
}
