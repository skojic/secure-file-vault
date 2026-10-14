import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

const fileEnv = existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")) : {};
const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  fileEnv.DATABASE_URL_TEST ??
  "postgres://vault:vault-dev-only@127.0.0.1:5433/secure_file_vault_test";
// globalSetup runs in this process, which does not receive `test.env`.
process.env.DATABASE_URL_TEST = testDatabaseUrl;
// One storage directory per run, created and removed by tests/setup/global.ts. Never the dev STORAGE_DIR.
const testStorageDir = join(tmpdir(), `secure-file-vault-test-${process.pid}`);
process.env.TEST_STORAGE_DIR = testStorageDir;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside the react-server condition; tests run server code directly.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/setup/global.ts"],
    // Integration files share one database.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_TEST: testDatabaseUrl,
      DB_STATEMENT_TIMEOUT_MS: "1000",
      DB_CONNECT_TIMEOUT_MS: "2000",
      STORAGE_DIR: testStorageDir,
      MAX_UPLOAD_BYTES: String(6 * 1024 * 1024),
      USER_QUOTA_BYTES: String(12 * 1024 * 1024),
      UPLOAD_TIMEOUT_MS: "2000",
    },
  },
});
