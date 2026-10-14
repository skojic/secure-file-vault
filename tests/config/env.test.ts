import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/env";

const valid = { DATABASE_URL: "postgres://vault:s3cret-pass@127.0.0.1:5433/vault" };

describe("env", () => {
  it("E15: missing DATABASE_URL fails with the variable name", () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("E15: malformed DATABASE_URL names the variable and never prints the value", () => {
    const secret = "not-a-url-with-s3cret-pass";
    let message = "";
    try {
      parseEnv({ DATABASE_URL: secret });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain(secret);
    expect(message).not.toContain("s3cret");
  });

  it("E15: a non-postgres URL is rejected without echoing it", () => {
    const url = "https://user:s3cret-pass@example.com/db";
    expect(() => parseEnv({ DATABASE_URL: url })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: url })).not.toThrow(/s3cret/);
  });

  it("applies defaults for the pool and timeouts", () => {
    const env = parseEnv(valid);
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.DB_CONNECT_TIMEOUT_MS).toBe(5000);
    expect(env.DB_STATEMENT_TIMEOUT_MS).toBe(10000);
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects a non-numeric timeout by name", () => {
    expect(() => parseEnv({ ...valid, DB_STATEMENT_TIMEOUT_MS: "soon" })).toThrow(/DB_STATEMENT_TIMEOUT_MS/);
  });
});
