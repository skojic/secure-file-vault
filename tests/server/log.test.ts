import { describe, expect, it } from "vitest";
import { redact } from "@/server/log";

describe("log redaction (rule 23)", () => {
  it("redacts sensitive keys at any depth, case-insensitively", () => {
    const out = redact({
      event: "login.failed",
      password: "hunter2-hunter2",
      user: { name: "Ana", Password: "x", session: { token: "abc", cookie: "sid=1" } },
      headers: { Authorization: "Bearer abc.def", "content-type": "text/plain" },
      body: { anything: "at all" },
      list: [{ secret: "s" }, "plain"],
    }) as Record<string, unknown>;

    const text = JSON.stringify(out);
    for (const leaked of ["hunter2", "abc.def", "sid=1", "at all", '"s"']) expect(text).not.toContain(leaked);
    expect(out.event).toBe("login.failed");
    expect((out.headers as Record<string, unknown>)["content-type"]).toBe("text/plain");
    expect((out.user as Record<string, unknown>).name).toBe("Ana");
    expect((out.list as unknown[])[1]).toBe("plain");
  });

  it("serialises errors as name, message, code and cause only", () => {
    const cause = Object.assign(new Error("terminating connection"), { code: "57P01" });
    const err = Object.assign(new Error("boom", { cause }), { client: { secretKey: 42, host: "db" }, code: "X1" });
    const out = redact({ err }) as { err: Record<string, unknown> };
    expect(out.err).toEqual({
      name: "Error",
      message: "boom",
      code: "X1",
      cause: { name: "Error", message: "terminating connection", code: "57P01" },
    });
  });

  it("does not loop on circular structures", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });
});
