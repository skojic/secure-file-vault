// The only reader of process.env (rule 22). Parsed once at import; a bad value stops startup.
import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10000),
  // Each argon2id hash holds 19 MiB; this caps how many run at once (F6, B2).
  ARGON2_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  // decisions/08: open or closed self-registration (invite codes are not built yet).
  REGISTRATION_MODE: z.enum(["open", "closed"]).default("open"),
  // Sessions: server-side lifetime, extended when less than half remains (B3).
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).default(43200),
  // Login rate limits per fixed window (decisions/09, F6).
  LOGIN_LIMIT_PER_USERNAME: z.coerce.number().int().min(1).default(10),
  LOGIN_LIMIT_PER_IP: z.coerce.number().int().min(1).default(50),
  LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(10).default(300),
  // Trust X-Forwarded-For only behind a known proxy; otherwise the per-IP limit is skipped.
  TRUST_PROXY_HEADERS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Uploads (rules 14, 28). STORAGE_DIR must exist and be writable; it is never created implicitly,
  // so a missing volume shows up as "not ready" instead of an empty new directory (F2, F11).
  STORAGE_DIR: z.string().min(1).default("./storage"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1).default(50 * 1024 * 1024),
  USER_QUOTA_BYTES: z.coerce.number().int().min(1).default(1024 * 1024 * 1024),
  UPLOAD_TIMEOUT_MS: z.coerce.number().int().min(100).default(10 * 60 * 1000),
  // The site's own origin for the upload Origin check (rule 13). Unset: derived from the Host header.
  APP_ORIGIN: z.url().optional(),
  // Read only by scripts/seed.ts, which checks they are present (F8).
  SEED_ADMIN_NAME: z.string().optional(),
  SEED_ADMIN_USERNAME: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(readonly variables: string[]) {
    super(`Invalid environment: ${variables.join(", ")}. See .env.example.`);
    this.name = "EnvError";
  }
}

// The message carries variable names and issue codes only. Zod issues can hold the rejected
// input, and a connection string holds a password, so neither the input nor Zod's own message is used.
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const variables = result.error.issues.map((issue) => `${issue.path.join(".")} (${issue.code})`);
  throw new EnvError([...new Set(variables)]);
}

export const env = parseEnv(process.env);
