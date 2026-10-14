// Duplicate-request guard (rule 26, docs/security/request-flow.md). The service claims the key
// before any effect: a completed key replays its stored result, a running key is 409, and a key
// reused for a different user, route or request is 422. All time comparisons use the database clock.
import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { idempotencyKeys } from "@/server/db/schema";
import { ConflictError, KeyMismatchError } from "@/server/errors";
import { log } from "@/server/log";

export type StoredResult = { status: number; body: unknown };
export type Claim = { kind: "run"; token: string } | { kind: "replay"; result: StoredResult };

export type ClaimInput = {
  key: string;
  userId: string | null;
  route: string;
  requestHash: string;
  // How long a claim may stay in progress before it counts as abandoned and can be reclaimed.
  staleAfterSeconds: number;
};

const attemptToken = sql<string>`${idempotencyKeys.createdAt}::text`;
const ownedBy = (key: string, token: string) => and(eq(idempotencyKeys.key, key), sql`${idempotencyKeys.createdAt} = ${token}::timestamptz`);

const RETRY_AFTER_SECONDS = 2;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// SHA-256 of the route and the validated input. Callers leave secrets (passwords) out of `input`.
export function requestHash(route: string, input: unknown): string {
  return createHash("sha256").update(route).update("\0").update(stableJson(input)).digest("hex");
}

export async function claimKey(input: ClaimInput, attempt = 0): Promise<Claim> {
  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      key: input.key,
      userId: input.userId,
      route: input.route,
      requestHash: input.requestHash,
      expiresAt: sql`now() + interval '24 hours'`,
    })
    .onConflictDoNothing()
    .returning({ token: attemptToken });
  if (inserted.length > 0) return { kind: "run", token: inserted[0].token };

  const [row] = await db
    .select({
      userId: idempotencyKeys.userId,
      route: idempotencyKeys.route,
      requestHash: idempotencyKeys.requestHash,
      state: idempotencyKeys.state,
      responseStatus: idempotencyKeys.responseStatus,
      responseBody: idempotencyKeys.responseBody,
      expired: sql<boolean>`${idempotencyKeys.expiresAt} <= now()`,
    })
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, input.key));

  // Deleted or expired between the insert and the read: try once more.
  if (!row || row.expired) {
    if (attempt > 0) throw new ConflictError("in_progress", RETRY_AFTER_SECONDS);
    if (row) await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.key, input.key), sql`${idempotencyKeys.expiresAt} <= now()`));
    return claimKey(input, attempt + 1);
  }

  if (row.userId !== input.userId || row.route !== input.route || row.requestHash !== input.requestHash) {
    throw new KeyMismatchError("idempotency key reused for a different request");
  }

  if (row.state === "completed") {
    return { kind: "replay", result: { status: row.responseStatus ?? 200, body: row.responseBody } };
  }

  // In progress: reclaim only if the earlier attempt is older than the request timeout.
  const reclaimed = await db
    .update(idempotencyKeys)
    .set({ createdAt: sql`now()` })
    .where(
      and(
        eq(idempotencyKeys.key, input.key),
        eq(idempotencyKeys.state, "in_progress"),
        sql`${idempotencyKeys.createdAt} <= now() - make_interval(secs => ${input.staleAfterSeconds})`,
      ),
    )
    .returning({ token: attemptToken });
  if (reclaimed.length > 0) return { kind: "run", token: reclaimed[0].token };
  throw new ConflictError("in_progress", RETRY_AFTER_SECONDS);
}

// Marks the key done and stores the answer, only if this attempt still holds it. Returns false otherwise.
export async function completeKey(key: string, token: string, result: StoredResult): Promise<boolean> {
  const updated = await db
    .update(idempotencyKeys)
    .set({ state: "completed", responseStatus: result.status, responseBody: result.body })
    .where(ownedBy(key, token))
    .returning({ key: idempotencyKeys.key });
  return updated.length > 0;
}

// Frees a key whose effect failed, so the same key can retry. Only the attempt holding the token can free it.
export async function releaseKey(key: string, token: string): Promise<void> {
  await db.delete(idempotencyKeys).where(and(ownedBy(key, token), eq(idempotencyKeys.state, "in_progress")));
}

export async function purgeExpiredKeys(): Promise<void> {
  await db.delete(idempotencyKeys).where(sql`${idempotencyKeys.expiresAt} <= now()`);
}

// Claim → effect → store result. A replay never runs the effect; a failed effect releases the key.
export async function withIdempotency(
  claim: ClaimInput,
  effect: () => Promise<StoredResult>,
): Promise<StoredResult & { replayed: boolean }> {
  const outcome = await claimKey(claim);
  if (outcome.kind === "replay") return { ...outcome.result, replayed: true };
  try {
    const result = await effect();
    if (!(await completeKey(claim.key, outcome.token, result))) log.warn("idempotency.claim_lost", { route: claim.route });
    return { ...result, replayed: false };
  } catch (err) {
    await releaseKey(claim.key, outcome.token).catch((releaseErr: unknown) => log.error("idempotency.release_failed", { err: releaseErr }));
    throw err;
  }
}
