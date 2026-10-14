// Fixed-window counters in PostgreSQL (decisions/09). One upsert per attempt; the window is computed
// from the database clock. Keys are hashed so raw IPs and usernames are not stored.
import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { RateLimitedError } from "@/server/errors";

export async function hit(scope: string, subject: string, limit: number, windowSeconds: number): Promise<void> {
  const key = createHash("sha256").update(scope).update("\0").update(subject).digest("hex");
  const { rows } = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count,
      ceil(extract(epoch FROM (window_start + make_interval(secs => ${windowSeconds}) - now())))::int AS retry_after
  `);
  const row = rows[0];
  if (row.count > limit) throw new RateLimitedError(Math.max(1, row.retry_after));
}

export async function purgeOldWindows(maxWindowSeconds: number): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - make_interval(secs => ${maxWindowSeconds})`);
}
