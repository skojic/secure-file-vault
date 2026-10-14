// End-to-end run against the production build. Uses its own database and storage directory, so it
// never touches dev data or the Vitest database.
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { defineConfig } from "@playwright/test";

const fileEnv = existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")) : {};
const testUrl = process.env.DATABASE_URL_TEST ?? fileEnv.DATABASE_URL_TEST ?? "postgres://vault:vault-dev-only@127.0.0.1:5433/secure_file_vault_test";
const e2eUrl = new URL(testUrl);
e2eUrl.pathname = "/secure_file_vault_e2e";

const PORT = 3200;
const storageDir = join(tmpdir(), "secure-file-vault-e2e-storage");

process.env.E2E_DATABASE_URL = e2eUrl.toString();
process.env.E2E_STORAGE_DIR = storageDir;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    // A static page: /api/health would stay 503 until global setup has migrated the database.
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: e2eUrl.toString(),
      STORAGE_DIR: storageDir,
      MAX_UPLOAD_BYTES: String(5 * 1024 * 1024),
    },
  },
});
