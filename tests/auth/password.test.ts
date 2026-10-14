import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("H1: stores an argon2id PHC string at the OWASP minimum, never the input", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).toContain("m=19456,t=2,p=1");
    expect(hash).not.toContain("correct horse battery");
  });

  it("verifies the right password and rejects a wrong one or a malformed hash", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "correct horse batterY")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything at all")).toBe(false);
  });

  it("E5: argon2id does not truncate at 72 bytes", async () => {
    const prefix = "x".repeat(72);
    const hash = await hashPassword(`${prefix}-first`);
    expect(await verifyPassword(hash, `${prefix}-second`)).toBe(false);
  });

  it("the dummy verify always fails", async () => {
    expect(await verifyAgainstDummy("whatever-password")).toBe(false);
  });
});
