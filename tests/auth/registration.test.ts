import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { registerAction } from "@/app/(auth)/register/actions";
import { registerUser } from "@/server/auth/service";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { KeyMismatchError, ValidationError } from "@/server/errors";
import { resetTables } from "../setup/reset";

const input = (overrides: Partial<{ name: string; username: string; password: string }> = {}) => ({
  name: "Ana Kovač",
  username: "ana",
  password: "correct horse battery",
  ...overrides,
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

// redirect() throws an error whose digest starts with NEXT_REDIRECT.
const isRedirect = (err: unknown) => String((err as { digest?: string })?.digest ?? "").startsWith("NEXT_REDIRECT");

describe("registration", () => {
  beforeEach(resetTables);

  it("H1: creates a staff user with an argon2id hash and a normalised username", async () => {
    const { userId } = await registerUser(input({ username: " Ana " }), randomUUID());
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.role).toBe("staff");
    expect(row.username).toBe("ana");
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("a visitor sending role=admin still gets staff (rule 7)", async () => {
    const err = await registerAction(
      { status: "idle" },
      form({ ...input(), role: "admin", idempotencyKey: randomUUID() }),
    ).catch((e: unknown) => e);
    expect(isRedirect(err)).toBe(true);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("staff");
  });

  it("E1: lookalike usernames collide with an existing one", async () => {
    await registerUser(input({ username: "admin" }), randomUUID());
    for (const lookalike of ["Admin", " admin ", "ａｄｍｉｎ"]) {
      await expect(registerUser(input({ username: lookalike }), randomUUID())).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("E3: a taken username gets a generic error that does not say the name exists", async () => {
    await registerUser(input(), randomUUID());
    const state = await registerAction({ status: "idle" }, form({ ...input(), idempotencyKey: randomUUID() }));
    expect(state.status).toBe("error");
    expect(state.fields?.username).toBeUndefined();
    expect(JSON.stringify(state).toLowerCase()).not.toMatch(/taken|exists|already/);
  });

  it("E20: the same submission twice with one key creates one user and returns the same result", async () => {
    const key = randomUUID();
    const first = await registerUser(input(), key);
    const second = await registerUser(input(), key);
    expect(second.userId).toBe(first.userId);
    expect(second.replayed).toBe(true);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("E20: a replayed submission through the action redirects like the first", async () => {
    const key = randomUUID();
    const fd = () => form({ ...input(), idempotencyKey: key });
    expect(isRedirect(await registerAction({ status: "idle" }, fd()).catch((e: unknown) => e))).toBe(true);
    expect(isRedirect(await registerAction({ status: "idle" }, fd()).catch((e: unknown) => e))).toBe(true);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("E21: the same key with a different username is rejected and creates nothing", async () => {
    const key = randomUUID();
    await registerUser(input(), key);
    await expect(registerUser(input({ username: "bojan" }), key)).rejects.toBeInstanceOf(KeyMismatchError);
    expect(await db.select().from(users)).toHaveLength(1);

    const state = await registerAction({ status: "idle" }, form({ ...input({ username: "bojan" }), idempotencyKey: key }));
    expect(state.status).toBe("error");
  });

  it("rejects a missing or malformed idempotency key before doing anything", async () => {
    for (const key of [undefined, "not-a-uuid"]) {
      const fields: Record<string, string> = { ...input() };
      if (key) fields.idempotencyKey = key;
      const state = await registerAction({ status: "idle" }, form(fields));
      expect(state.status).toBe("error");
    }
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
