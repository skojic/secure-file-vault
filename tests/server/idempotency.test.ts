import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { ConflictError, KeyMismatchError } from "@/server/errors";
import { type Claim, claimKey, completeKey, releaseKey, requestHash, withIdempotency } from "@/server/idempotency";
import { resetTables } from "../setup/reset";

const base = (key = randomUUID()) => ({
  key,
  userId: null as string | null,
  route: "test.route",
  requestHash: requestHash("test.route", { a: 1 }),
  staleAfterSeconds: 60,
});

const runToken = (claim: Claim) => {
  if (claim.kind !== "run") throw new Error(`expected a run claim, got ${claim.kind}`);
  return claim.token;
};

describe("idempotency keys (rule 26)", () => {
  beforeEach(resetTables);

  it("E20: a new key runs; a completed key replays the stored result", async () => {
    const claim = base();
    const won = await claimKey(claim);
    expect(won).toEqual({ kind: "run", token: expect.any(String) });
    await completeKey(claim.key, runToken(won), { status: 201, body: { id: "abc" } });
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
    expect(await claimKey(claim)).toEqual({ kind: "run", token: expect.any(String) });
  });

  it("E21: the same key for a different request, route or user is 422", async () => {
    const claim = base();
    await completeKey(claim.key, runToken(await claimKey(claim)), { status: 201, body: {} });
    await expect(claimKey({ ...claim, requestHash: requestHash("test.route", { a: 2 }) })).rejects.toBeInstanceOf(KeyMismatchError);
    await expect(claimKey({ ...claim, route: "other.route" })).rejects.toBeInstanceOf(KeyMismatchError);

    const [u] = await db.insert(users).values({ name: "U", username: "someone", passwordHash: "x", role: "staff" }).returning({ id: users.id });
    await expect(claimKey({ ...claim, userId: u.id })).rejects.toBeInstanceOf(KeyMismatchError);
  });

  it("a released key can run again; an expired key is reclaimed", async () => {
    const claim = base();
    await releaseKey(claim.key, runToken(await claimKey(claim)));
    const again = await claimKey(claim);
    expect(again.kind).toBe("run");
    expect(await completeKey(claim.key, runToken(again), { status: 200, body: {} })).toBe(true);
    await db.execute(sql`UPDATE idempotency_keys SET expires_at = now() - interval '1 second' WHERE key = ${claim.key}`);
    expect((await claimKey(claim)).kind).toBe("run");
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
    expect((await claimKey(failing)).kind).toBe("run");
  });

  const takeOverDuring = (claim: ReturnType<typeof base>) => async () => {
    await db.execute(sql`UPDATE idempotency_keys SET created_at = now() - interval '2 minutes' WHERE key = ${claim.key}`);
    expect((await claimKey(claim)).kind).toBe("run");
  };

  it("E20: a stale attempt that fails late does not release the attempt that took over", async () => {
    const claim = base();
    const takeOver = takeOverDuring(claim);
    await expect(withIdempotency(claim, async () => { await takeOver(); throw new Error("late failure"); })).rejects.toThrow("late failure");
    // B still holds the key, so a third request is told to wait, not allowed to run a second effect.
    await expect(claimKey(claim)).rejects.toBeInstanceOf(ConflictError);
  });

  it("a release or completion with a token from a superseded attempt changes nothing", async () => {
    const claim = base();
    const first = runToken(await claimKey(claim));
    await db.execute(sql`UPDATE idempotency_keys SET created_at = now() - interval '2 minutes' WHERE key = ${claim.key}`);
    const second = runToken(await claimKey(claim));
    expect(second).not.toBe(first);
    await releaseKey(claim.key, first);
    expect(await completeKey(claim.key, first, { status: 201, body: { from: "A" } })).toBe(false);
    expect(await completeKey(claim.key, second, { status: 201, body: { from: "B" } })).toBe(true);
    expect(await claimKey(claim)).toEqual({ kind: "replay", result: { status: 201, body: { from: "B" } } });
  });

  it("E20: a stale attempt that finishes late does not complete the attempt that took over", async () => {
    const claim = base();
    const takeOver = takeOverDuring(claim);
    await withIdempotency(claim, async () => { await takeOver(); return { status: 201, body: { from: "A" } }; });
    await expect(claimKey(claim)).rejects.toBeInstanceOf(ConflictError);
  });

  it("the request hash ignores key order but not values", () => {
    expect(requestHash("r", { a: 1, b: 2 })).toBe(requestHash("r", { b: 2, a: 1 }));
    expect(requestHash("r", { a: 1 })).not.toBe(requestHash("r", { a: 2 }));
    expect(requestHash("r", { a: 1 })).not.toBe(requestHash("s", { a: 1 }));
  });
});
