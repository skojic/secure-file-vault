// E2 counts argon2 verify calls, so the library is wrapped in a spy in this file only.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeJar } from "../setup/fakes";
import { resetTables } from "../setup/reset";

const verifySpy = vi.hoisted(() => ({ fn: null as null | ReturnType<typeof vi.fn> }));
vi.mock("@node-rs/argon2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@node-rs/argon2")>();
  verifySpy.fn = vi.fn(actual.verify);
  return { ...actual, verify: verifySpy.fn };
});

const { login, registerUser } = await import("@/server/auth/service");
const { verifyAgainstDummy } = await import("@/server/auth/password");

describe("login timing", () => {
  beforeEach(async () => {
    await resetTables();
    await registerUser({ name: "Ana", username: "ana", password: "correct horse battery" }, randomUUID());
    // Warm the dummy hash so the first unknown-user attempt does not also pay for creating it.
    await verifyAgainstDummy("warm-up");
    verifySpy.fn!.mockClear();
  });

  it("E2: unknown user and wrong password each run exactly one argon2 verify and fail identically", async () => {
    const unknown = await login({ username: "nobody", password: "whatever password" }, { jar: new FakeJar(), ip: null }).catch((e: unknown) => e);
    expect(verifySpy.fn).toHaveBeenCalledTimes(1);

    verifySpy.fn!.mockClear();
    const wrong = await login({ username: "ana", password: "whatever password" }, { jar: new FakeJar(), ip: null }).catch((e: unknown) => e);
    expect(verifySpy.fn).toHaveBeenCalledTimes(1);

    expect((unknown as Error).constructor).toBe((wrong as Error).constructor);
    expect((unknown as Error).message).toBe((wrong as Error).message);
  });
});
