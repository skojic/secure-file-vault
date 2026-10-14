import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { checkReadiness } from "@/server/health";
import journal from "@/server/db/migrations/meta/_journal.json";
import { createScratchDatabase } from "../setup/db";

describe("readiness", () => {
  const unreachable = new Pool({ connectionString: "postgres://vault:x@127.0.0.1:1/none", connectionTimeoutMillis: 500 });
  afterAll(async () => {
    await unreachable.end();
  });

  it("F11: ready when the database answers and every migration is applied", async () => {
    const { pool } = await import("@/server/db/client");
    expect(await checkReadiness({ pool })).toEqual({ ok: true, failed: [] });
  });

  it("F11: not ready when the database is unreachable", async () => {
    const result = await checkReadiness({ pool: unreachable });
    expect(result.ok).toBe(false);
    expect(result.failed).toContain("database");
  });

  it("F11: not ready when a migration in the journal is not applied", async () => {
    const { pool } = await import("@/server/db/client");
    const ahead = { entries: [...journal.entries, { idx: 999, when: Date.now() + 60_000, tag: "9999_future" }] };
    const result = await checkReadiness({ pool, journal: ahead });
    expect(result).toEqual({ ok: false, failed: ["migrations"] });
  });

  it("F11: a database that was never migrated reports migrations, not database", async () => {
    const scratch = await createScratchDatabase();
    const fresh = new Pool({ connectionString: scratch.url });
    try {
      expect(await checkReadiness({ pool: fresh })).toEqual({ ok: false, failed: ["migrations"] });
    } finally {
      await fresh.end();
      await scratch.drop();
    }
  });

  it("F11: the route returns 503 with a body that names nothing", async () => {
    vi.resetModules();
    vi.doMock("next/server", () => ({ connection: async () => {} }));
    vi.doMock("@/server/health", () => ({
      checkReadiness: async () => ({ ok: false, failed: ["database"] }),
    }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: "unavailable" });
    expect(text).not.toContain("database");
    vi.doUnmock("next/server");
    vi.doUnmock("@/server/health");
  });

  it("F11: the route returns 200 when ready", async () => {
    vi.resetModules();
    vi.doMock("next/server", () => ({ connection: async () => {} }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    vi.doUnmock("next/server");
  });
});
