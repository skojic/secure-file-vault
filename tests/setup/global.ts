// Runs once before the suite: create the test database if missing, then apply every migration.
import { spawnSync } from "node:child_process";
import { adminQuery, testDatabaseUrl } from "./db";

export default async function setup() {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  const exists = await adminQuery("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.length === 0) await adminQuery(`CREATE DATABASE "${name}"`);

  const run = spawnSync("npm", ["run", "--silent", "db:migrate"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error(`migrating the test database failed:\n${run.stdout}\n${run.stderr}`);
  }
}
