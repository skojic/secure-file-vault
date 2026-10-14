import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { ConflictError, KeyMismatchError } from "@/server/errors";
import { claimKey, completeKey, releaseKey, requestHash, withIdempotency } from "@/server/idempotency";
import { resetTables } from "../setup/reset";

const base = (key = randomUUID()) => ({
  key,
  userId: null as string | null,
  route: "test.route",
  requestHash: requestHash("test.route", { a: 1 }),
  staleAfterSeconds: 60,
});

describe("idempotency keys (rule 26)", () => {
  beforeEach(resetTables);

  it("E20: a new key runs; a completed key replays the stored result", async () => {
    const claim = base();
    expect(await claimKey(claim)).toEqual({ kind: "run" });
    await completeKey(claim.key, { status: 201, body: { id: "abc" } });
    expect(await claimKey(claim)).toEqual({ kind: "replay", result: { status: 201, body: { id: "abc" } } });
  });

  it("E20: a key still in progress is a 409 with Retry-After", async () => {
    const claim = base();
    await claimKey(claim);
    const err = await claimKey(claim).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).reason).toBe("in_progress");
    expect((err as ConflictError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("E20: an in-progress key older than the request timeout is reclaimed", async () => {
    const claim = base();
    await claimKey(claim);
    await db.execute(sql`UPDATE idempotency_keys SET created_at = now() - interval '2 minutes' WHERE key = ${claim.key}`);
    expect(await claimKey(claim)).toEqual({ kind: "run" });
  });

  it("E21: the same key for a different request, route or user is 422", async () => {
    const claim = base();
    await claimKey(claim);
    await completeKey(claim.key, { status: 201, body: {} });
    await expect(claimKey({ ...claim, requestHash: requestHash("test.route", { a: 2 }) })).rejects.toBeInstanceOf(KeyMismatchError);
    await expect(claimKey({ ...claim, route: "other.route" })).rejects.toBeInstanceOf(KeyMismatchError);

    const [u] = await db.insert(users).values({ name: "U", username: "someone", passwordHash: "x", role: "staff" }).returning({ id: users.id });
    await expect(claimKey({ ...claim, userId: u.id })).rejects.toBeInstanceOf(KeyMismatchError);
  });

  it("a released key can run again; an expired key is reclaimed", async () => {
    const claim = base();
    await claimKey(claim);
    await releaseKey(claim.key);
    expect(await claimKey(claim)).toEqual({ kind: "run" });
    await completeKey(claim.key, { status: 200, body: {} });
    await db.execute(sql`UPDATE idempotency_keys SET expires_at = now() - interval '1 second' WHERE key = ${claim.key}`);
    expect(await claimKey(claim)).toEqual({ kind: "run" });
  });

  it("withIdempotency runs the effect once, replays it, and releases the key when the effect fails", async () => {
    let runs = 0;
    const claim = base();
    const effect = async () => ({ status: 201, body: { n: ++runs } });
    expect(await withIdempotency(claim, effect)).toEqual({ status: 201, body: { n: 1 }, replayed: false });
    expect(await withIdempotency(claim, effect)).toEqual({ status: 201, body: { n: 1 }, replayed: true });
    expect(runs).toBe(1);

    const failing = base();
    await expect(withIdempotency(failing, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await claimKey(failing)).toEqual({ kind: "run" });
  });

  it("the request hash ignores key order but not values", () => {
    expect(requestHash("r", { a: 1, b: 2 })).toBe(requestHash("r", { b: 2, a: 1 }));
    expect(requestHash("r", { a: 1 })).not.toBe(requestHash("r", { a: 2 }));
    expect(requestHash("r", { a: 1 })).not.toBe(requestHash("s", { a: 1 }));
  });
});
