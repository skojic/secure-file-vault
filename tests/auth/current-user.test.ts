// getCurrentUser() reads Next's cookies(); here it is replaced, and the database is made to fail.
import { describe, expect, it, vi } from "vitest";
import { isDependencyFailure, toErrorResponse } from "@/server/http";

const cookieValue = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue.token ? { value: cookieValue.token } : undefined) }),
}));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  resolveSession: async () => {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5433"), { code: "ECONNREFUSED" });
  },
}));

const { getCurrentUser } = await import("@/server/auth/current-user");

describe("getCurrentUser", () => {
  it("returns null without a session cookie, without touching the database", async () => {
    cookieValue.token = undefined;
    expect(await getCurrentUser()).toBeNull();
  });

  it("F3: a failed lookup throws (→ 503) instead of returning anonymous", async () => {
    cookieValue.token = "some-token";
    const err = await getCurrentUser().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isDependencyFailure(err)).toBe(true);
    expect(toErrorResponse(err).status).toBe(503);
  });
});
