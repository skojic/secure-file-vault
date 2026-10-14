import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "@/env";
import { hashSlots } from "@/server/auth/password";
import { login, logout, registerUser } from "@/server/auth/service";
import { resolveSession, SESSION_COOKIE } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { RateLimitedError, UnauthorizedError } from "@/server/errors";
import { FakeJar } from "../setup/fakes";
import { resetTables } from "../setup/reset";

const PASSWORD = "correct horse battery";

async function register(username: string) {
  return registerUser({ name: username, username, password: PASSWORD }, randomUUID());
}

describe("login and logout", () => {
  beforeEach(resetTables);

  it("H2: a correct password creates a session and rotates any previous one", async () => {
    await register("ana");
    const jar = new FakeJar();
    const first = await login({ username: "ana", password: PASSWORD }, { jar, ip: null });
    expect(first.username).toBe("ana");
    const oldToken = jar.get(SESSION_COOKIE)!.value;

    await login({ username: " ANA ", password: PASSWORD }, { jar, ip: null });
    const newToken = jar.get(SESSION_COOKIE)!.value;
    expect(newToken).not.toBe(oldToken);
    expect(await resolveSession(oldToken)).toBeNull();
    expect((await resolveSession(newToken))?.username).toBe("ana");
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("wrong password, unknown user and disabled user all fail the same way", async () => {
    await register("ana");
    await register("bojan");
    await db.update(users).set({ disabledAt: sql`now()` }).where(eq(users.username, "bojan"));
    for (const attempt of [
      { username: "ana", password: "wrong password here" },
      { username: "nobody", password: PASSWORD },
      { username: "bojan", password: PASSWORD },
    ]) {
      const jar = new FakeJar();
      const err = await login(attempt, { jar, ip: null }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnauthorizedError);
      expect((err as Error).message).toBe("invalid credentials");
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
    }
  });

  it("E7: login removes expired session rows", async () => {
    const { userId } = await register("ana");
    await db.insert(sessions).values({ id: "expired-row", userId, expiresAt: sql`now() - interval '1 hour'` });
    await login({ username: "ana", password: PASSWORD }, { jar: new FakeJar(), ip: null });
    const ids = (await db.select().from(sessions)).map((s) => s.id);
    expect(ids).not.toContain("expired-row");
  });

  it("H6: logout deletes the session and clears the cookie", async () => {
    await register("ana");
    const jar = new FakeJar();
    await login({ username: "ana", password: PASSWORD }, { jar, ip: null });
    const token = jar.get(SESSION_COOKIE)!.value;
    await logout(jar);
    expect(jar.get(SESSION_COOKIE)).toBeUndefined();
    expect(await resolveSession(token)).toBeNull();
  });

  it("F6: rate limit per username stops attempts before hashing", async () => {
    await register("ana");
    const limit = env.LOGIN_LIMIT_PER_USERNAME;
    for (let i = 0; i < limit; i++) {
      await login({ username: "ana", password: "wrong password here" }, { jar: new FakeJar(), ip: null }).catch(() => undefined);
    }
    hashSlots.peak = 0;
    const err = await login({ username: "ana", password: PASSWORD }, { jar: new FakeJar(), ip: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfterSeconds).toBeGreaterThan(0);
    expect(hashSlots.peak).toBe(0);
  }, 60_000);

  it("F6: rate limit per IP applies across usernames", async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < env.LOGIN_LIMIT_PER_IP; i++) {
      await login({ username: `nobody${i}`, password: PASSWORD }, { jar: new FakeJar(), ip }).catch(() => undefined);
    }
    await expect(login({ username: "another", password: PASSWORD }, { jar: new FakeJar(), ip })).rejects.toBeInstanceOf(RateLimitedError);
    await expect(login({ username: "another", password: PASSWORD }, { jar: new FakeJar(), ip: "203.0.113.8" })).rejects.toBeInstanceOf(UnauthorizedError);
  }, 60_000);

  it("F6, B2: 50 parallel logins never run more hashes at once than the cap", async () => {
    const names = Array.from({ length: 10 }, (_, i) => `user${i}`);
    for (const n of names) await register(n);
    hashSlots.peak = 0;
    const timings: number[] = [];
    await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const started = performance.now();
        await login({ username: names[i % names.length], password: PASSWORD }, { jar: new FakeJar(), ip: null });
        timings.push(performance.now() - started);
      }),
    );
    expect(hashSlots.peak).toBeLessThanOrEqual(env.ARGON2_MAX_CONCURRENCY);
    expect(hashSlots.peak).toBeGreaterThan(1);
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
    console.info(`B2: 50 parallel logins, cap ${env.ARGON2_MAX_CONCURRENCY}, p95 ${p95.toFixed(0)} ms`);
  }, 120_000);
});
