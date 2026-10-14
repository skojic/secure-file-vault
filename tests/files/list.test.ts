import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/server/db/client";
import { buildListQuery, listFiles } from "@/server/files/service";
import { resetTables } from "../setup/reset";
import { makeUser, uploadPng } from "../setup/users";

// Inserts `count` ready rows for `uploaderId` directly; list tests need volume, not real bytes.
async function seedRows(uploaderId: string, count: number) {
  await db.execute(sql`
    INSERT INTO files (original_name, size_bytes, content_type, storage_key, status, uploader_id, created_at, updated_at)
    SELECT 'seed-' || g || '.png', 100, 'image/png', gen_random_uuid(), 'ready', ${uploaderId}::uuid,
           now() - (g || ' seconds')::interval, now()
    FROM generate_series(1, ${count}) AS g
  `);
}

describe("listing files", () => {
  beforeEach(resetTables);

  it("H3, rule 3: a staff list never contains another user's file, even with 1,000 rows from others", async () => {
    const ana = await makeUser("ana");
    const bojan = await makeUser("bojan");
    await seedRows(bojan.id, 1000);
    const mine = await uploadPng(ana, "mine.png");

    const page = await listFiles(ana, {});
    expect(page.items.map((f) => f.id)).toEqual([mine.id]);
    expect(page.nextCursor).toBeNull();
  });

  it("admins see every ready file; pending rows are never listed", async () => {
    const ana = await makeUser("ana");
    const root = await makeUser("root", "admin");
    await seedRows(ana.id, 3);
    await db.execute(sql`INSERT INTO files (original_name, size_bytes, content_type, storage_key, status, uploader_id) VALUES ('half.png', 1, 'image/png', gen_random_uuid(), 'pending', ${ana.id}::uuid)`);
    const page = await listFiles(root, {});
    expect(page.items).toHaveLength(3);
    expect(page.items.every((f) => f.uploaderName === "ana")).toBe(true);
    expect(page.items.some((f) => f.originalName === "half.png")).toBe(false);
  });

  it("B4: keyset pages cover every row once, in order, with no OFFSET", async () => {
    const ana = await makeUser("ana");
    await seedRows(ana.id, 125);
    const seen: string[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await listFiles(ana, { cursor: cursor ?? undefined, limit: 50 });
      seen.push(...page.items.map((f) => f.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(125);
    expect(new Set(seen).size).toBe(125);
  });

  it("a malformed cursor starts from the first page instead of failing", async () => {
    const ana = await makeUser("ana");
    await seedRows(ana.id, 2);
    expect((await listFiles(ana, { cursor: "not-a-cursor" })).items).toHaveLength(2);
  });

  it("B4: with 10k rows, the real staff and admin list queries read an index in order, with no sort", async () => {
    const ana = await makeUser("ana");
    const bojan = await makeUser("bojan", "admin");
    await seedRows(ana.id, 5000);
    await seedRows(bojan.id, 5000);
    await db.execute(sql`ANALYZE files`);

    for (const user of [ana, bojan]) {
      const query = buildListQuery(user, null, 50).toSQL();
      const { rows } = await pool.query(`EXPLAIN (FORMAT JSON) ${query.sql}`, query.params);
      const plan = JSON.stringify(rows[0]["QUERY PLAN"]);
      expect(plan, `${user.role}: ${plan}`).not.toContain('"Seq Scan"');
      expect(plan, `${user.role}: ${plan}`).not.toContain('"Node Type":"Sort"');
      expect(plan).toMatch(/files_(uploader_)?created_idx/);
    }
  }, 60_000);
});
