// E4 needs the hash function replaced by a spy, so it lives in its own file.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTables } from "../setup/reset";

const hashSpy = vi.hoisted(() => vi.fn(async () => "$argon2id$v=19$m=19456,t=2,p=1$stub$stub"));
vi.mock("@/server/auth/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/password")>()),
  hashPassword: hashSpy,
}));

const { registerAction } = await import("@/app/(auth)/register/actions");

const submit = (password: string) => {
  const fd = new FormData();
  fd.set("name", "Ana");
  fd.set("username", "ana");
  fd.set("password", password);
  fd.set("idempotencyKey", randomUUID());
  return registerAction({ status: "idle" }, fd);
};

describe("password bounds", () => {
  beforeEach(async () => {
    hashSpy.mockClear();
    await resetTables();
  });

  it("E4: 11 and 129 characters are rejected before hashing", async () => {
    for (const password of ["a".repeat(11), "a".repeat(129)]) {
      const state = await submit(password);
      expect(state.status).toBe("error");
      expect(state.fields?.password).toBeDefined();
    }
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it("E4: length counts characters, not UTF-16 units: 12 emoji pass the minimum", async () => {
    await submit("🔒".repeat(12)).catch(() => undefined);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });
});
