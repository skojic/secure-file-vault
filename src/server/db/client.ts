// One pool per process. In development the pool lives on globalThis so a hot reload that
// re-evaluates this module reuses it instead of opening a new one (B5).
import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import { log } from "@/server/log";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & { vaultPool?: Pool };

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
    // Server-side limit per statement: a hung query fails fast instead of holding a connection (F12).
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  });
  // An idle client losing its connection emits here; without a listener the process would crash.
  pool.on("error", (err) => log.error("db.pool.error", { err }));
  return pool;
}

export const pool = globalForDb.vaultPool ?? createPool();
if (env.NODE_ENV !== "production") globalForDb.vaultPool = pool;

export const db = drizzle({ client: pool, schema });
