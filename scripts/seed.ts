// Creates the first admin from SEED_ADMIN_* (F8). A no-op when any admin exists; no default password.
// Exits non-zero naming the missing or invalid variable, never printing its value.
import { env } from "@/env";
import { registrationSchema } from "@/lib/schemas/registration";
import { ensureFirstAdmin } from "@/server/auth/service";
import { pool } from "@/server/db/client";
import { log } from "@/server/log";

const FIELD_TO_VARIABLE: Record<string, string> = {
  name: "SEED_ADMIN_NAME",
  username: "SEED_ADMIN_USERNAME",
  password: "SEED_ADMIN_PASSWORD",
};

async function main(): Promise<number> {
  const parsed = registrationSchema.safeParse({
    name: env.SEED_ADMIN_NAME,
    username: env.SEED_ADMIN_USERNAME,
    password: env.SEED_ADMIN_PASSWORD,
  });
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((i) => FIELD_TO_VARIABLE[String(i.path[0])] ?? String(i.path[0])))];
    log.error("db.seed.invalid_env", { variables });
    return 1;
  }
  const { created } = await ensureFirstAdmin(parsed.data);
  log.info(created ? "db.seed.admin_created" : "db.seed.admin_exists", { username: parsed.data.username });
  return 0;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((err: unknown) => {
    const e = err as { code?: string; message?: string };
    log.error("db.seed.failed", { code: e.code, message: e.message });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
