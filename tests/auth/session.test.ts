import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession, deleteSession, hashToken, purgeExpired, resolveSession, SESSION_COOKIE } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { FakeJar } from "../setup/fakes";
import { resetTables } from "../setup/reset";

async function makeUser(role: "admin" | "staff" = "staff") {
  const [u] = await db.insert(users).values({ name: "Ana", username: `u${Math.random().toString(36).slice(2, 10)}`, passwordHash: "x", role }).returning();
  return u;
}

describe("sessions", () => {
  beforeEach(resetTables);

  it("H2: the cookie carries a 32-byte token with HttpOnly, SameSite=Lax, Path=/; the row holds only its SHA-256", async () => {
    const user = await makeUser();
    const jar = new FakeJar();
    await createSession(user.id, jar);
    const cookie = jar.store.get(SESSION_COOKIE);
    expect(cookie).toBeDefined();
    const token = cookie!.value;
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(cookie!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(cookie!.options?.maxAge).toBeUndefined();

    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(token);
    expect(rows[0].id).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashToken(token)).toBe(rows[0].id);
  });

  it("resolves a valid token to a narrow user, and an unknown token to null", async () => {
    const user = await makeUser();
    const jar = new FakeJar();
    await createSession(user.id, jar);
    expect(await resolveSession(jar.get(SESSION_COOKIE)!.value)).toEqual({ id: user.id, name: "Ana", username: user.username, role: "staff" });
    expect(await resolveSession("A".repeat(43))).toBeNull();
    expect(await resolveSession("")).toBeNull();
  });

  it("E6: a role change applies on the next request; a disabled user becomes anonymous", async () => {
    const user = await makeUser("admin");
    const jar = new FakeJar();
    await createSession(user.id, jar);
    const token = jar.get(SESSION_COOKIE)!.value;
    expect((await resolveSession(token))?.role).toBe("admin");

    await db.update(users).set({ role: "staff" }).where(eq(users.id, user.id));
    expect((await resolveSession(token))?.role).toBe("staff");

    await db.update(users).set({ disabledAt: sql`now()` }).where(eq(users.id, user.id));
    expect(await resolveSession(token)).toBeNull();
  });

  it("E7: an expired row is ignored and removed by cleanup", async () => {
    const user = await makeUser();
    const jar = new FakeJar();
    await createSession(user.id, jar);
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 second'` });
    expect(await resolveSession(jar.get(SESSION_COOKIE)!.value)).toBeNull();
    await purgeExpired();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("B3: two requests in a row cause zero session updates; extension happens only past half the lifetime", async () => {
    const user = await makeUser();
    const jar = new FakeJar();
    await createSession(user.id, jar);
    const token = jar.get(SESSION_COOKIE)!.value;
    const [before] = await db.select().from(sessions);
    await resolveSession(token);
    await resolveSession(token);
    const [after] = await db.select().from(sessions);
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());

    await db.update(sessions).set({ expiresAt: sql`now() + interval '10 seconds'` });
    const [nearlyExpired] = await db.select().from(sessions);
    await resolveSession(token);
    const [extended] = await db.select().from(sessions);
    expect(extended.expiresAt.getTime()).toBeGreaterThan(nearlyExpired.expiresAt.getTime() + 60_000);
  });

  it("H6: a deleted session no longer resolves", async () => {
    const user = await makeUser();
    const jar = new FakeJar();
    await createSession(user.id, jar);
    const token = jar.get(SESSION_COOKIE)!.value;
    await deleteSession(token);
    expect(await resolveSession(token)).toBeNull();
  });
});
