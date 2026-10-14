// The only reader of process.env (rule 22). Parsed once at import; a bad value stops startup.
import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10000),
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
