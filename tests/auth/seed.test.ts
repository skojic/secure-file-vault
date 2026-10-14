import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { resetTables } from "../setup/reset";

const seed = (vars: Record<string, string | undefined>) =>
  spawnSync("npm", ["run", "--silent", "db:seed"], {
    env: {
      ...process.env,
      SEED_ADMIN_NAME: undefined,
      SEED_ADMIN_USERNAME: undefined,
      SEED_ADMIN_PASSWORD: undefined,
      ...vars,
    },
    encoding: "utf8",
  });

const admin = { SEED_ADMIN_NAME: "First Admin", SEED_ADMIN_USERNAME: "root", SEED_ADMIN_PASSWORD: "a long admin passphrase" };

describe("admin seed", () => {
  beforeEach(resetTables);

  it("F8: running the seed twice leaves exactly one admin", async () => {
    const first = seed(admin);
    expect(first.status, first.stderr).toBe(0);
    const second = seed({ ...admin, SEED_ADMIN_USERNAME: "root2" });
    expect(second.status, second.stderr).toBe(0);
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    expect(admins).toHaveLength(1);
    expect(admins[0].passwordHash.startsWith("$argon2id$")).toBe(true);
  }, 60_000);

  it("F8: without SEED_ADMIN_PASSWORD the seed exits non-zero and creates nothing", async () => {
    const run = seed({ ...admin, SEED_ADMIN_PASSWORD: undefined });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/SEED_ADMIN_PASSWORD/);
    expect(await db.select().from(users)).toHaveLength(0);
  }, 60_000);

  it("F8: a short seed password is rejected and never printed", async () => {
    const run = seed({ ...admin, SEED_ADMIN_PASSWORD: "short-pw" });
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain("short-pw");
  }, 60_000);
});
