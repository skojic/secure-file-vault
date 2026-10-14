import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "@/server/http";
import { adminQuery, testDatabaseUrl } from "../setup/db";

const databaseName = () => new URL(testDatabaseUrl()).pathname.slice(1);

async function connectionCount(): Promise<number> {
  const rows = await adminQuery<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1",
    [databaseName()],
  );
  return rows[0].n;
}

describe("database client", () => {
  // Resetting the module cache stands in for a hot reload re-evaluating the module;
  // it does not run Next's dev server.
  it("B5: 20 fresh imports of the client module keep the connection count flat", async () => {
    vi.resetModules();
    const first = await import("@/server/db/client");
    await first.db.execute(sql`select 1`);
    const before = await connectionCount();

    for (let i = 0; i < 20; i++) {
      vi.resetModules();
      const mod = await import("@/server/db/client");
      await mod.db.execute(sql`select 1`);
      expect(mod.pool).toBe(first.pool);
    }

    expect(await connectionCount()).toBeLessThanOrEqual(before);
  });

  it("F12: a query past statement_timeout fails as 503 and releases its connection", async () => {
    const { db, pool } = await import("@/server/db/client");
    const started = Date.now();
    const err = await db.execute(sql`select pg_sleep(3)`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(2500);
    expect(toErrorResponse(err).status).toBe(503);
    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount).toBe(pool.totalCount);
  });
});
