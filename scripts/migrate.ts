// Applies pending migrations, then exits. Runs as its own deploy step, never from the app (F7).
// Exits non-zero on any failure, logging the error without the connection string.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/env";
import { log } from "@/server/log";

const migrationsFolder = new URL("../src/server/db/migrations", import.meta.url).pathname;

async function main() {
  // No statement_timeout here: a long migration must not be cut off half-way.
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    log.info("db.migrate.done");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const e = err as { code?: string; message?: string };
  log.error("db.migrate.failed", { code: e.code, message: e.message });
  process.exit(1);
});
