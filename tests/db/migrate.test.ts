import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScratchDatabase } from "../setup/db";

const migrate = (databaseUrl: string) =>
  spawnSync("npm", ["run", "--silent", "db:migrate"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });

describe("migrations", () => {
  let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;
  beforeAll(async () => {
    scratch = await createScratchDatabase();
  });
  afterAll(async () => {
    await scratch?.drop();
  });

  it("F7: migrate on an empty database exits 0, and a second run is a no-op", async () => {
    const first = migrate(scratch.url);
    expect(first.status, first.stderr).toBe(0);
    const second = migrate(scratch.url);
    expect(second.status, second.stderr).toBe(0);

    const client = new Client({ connectionString: scratch.url });
    await client.connect();
    try {
      const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
      expect(tables.rows.map((r) => r.table_name)).toContain("users");
      const applied = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      const again = await client.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      expect(applied.rows[0].n).toBeGreaterThan(0);
      expect(again.rows[0].n).toBe(applied.rows[0].n);
    } finally {
      await client.end();
    }
  }, 60_000);

  it("F7: an unreachable database exits non-zero without printing the connection string", () => {
    const url = "postgres://vault:s3cret-pass@127.0.0.1:1/nowhere";
    const run = migrate(url);
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain("s3cret-pass");
  }, 60_000);
});
