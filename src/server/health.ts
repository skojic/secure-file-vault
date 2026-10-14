// Readiness (rule 28, F11): the database answers and every migration in the journal is applied.
// Module 04 adds the storage check. Results name the failed checks for logs; the route never sends them.
import "server-only";
import type { Pool } from "pg";
import bundledJournal from "@/server/db/migrations/meta/_journal.json";

type Journal = { entries: { when: number; tag: string }[] };
export type Readiness = { ok: boolean; failed: string[] };

export async function checkReadiness({ pool, journal = bundledJournal }: { pool: Pool; journal?: Journal }): Promise<Readiness> {
  const failed: string[] = [];
  let latestApplied: number | null = null;
  try {
    // Drizzle records each applied migration's folder timestamp in created_at.
    const { rows } = await pool.query<{ latest: string | null }>("SELECT max(created_at)::text AS latest FROM drizzle.__drizzle_migrations");
    latestApplied = rows[0]?.latest ? Number(rows[0].latest) : 0;
  } catch (err) {
    // 42P01 undefined_table: the database answers but has never been migrated.
    failed.push((err as { code?: string }).code === "42P01" ? "migrations" : "database");
  }
  if (latestApplied !== null) {
    const latestInJournal = Math.max(0, ...journal.entries.map((e) => e.when));
    if (latestApplied < latestInJournal) failed.push("migrations");
  }
  return { ok: failed.length === 0, failed };
}
