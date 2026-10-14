// Fresh e2e database and storage directory for every run.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { Client } from "pg";

export default async function globalSetup() {
  const url = new URL(process.env.E2E_DATABASE_URL!);
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }

  const migrate = spawnSync("npm", ["run", "--silent", "db:migrate"], { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8" });
  if (migrate.status !== 0) throw new Error(`e2e migrate failed:\n${migrate.stdout}\n${migrate.stderr}`);

  const storage = process.env.E2E_STORAGE_DIR!;
  rmSync(storage, { recursive: true, force: true });
  mkdirSync(storage, { recursive: true });
}
