// Structured JSON logs with redaction (rule 23). Anything whose key looks sensitive is replaced
// before it is serialised, at any depth.
import "server-only";
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

const SENSITIVE = /pass(word)?|cookie|authori[sz]ation|token|secret|session|^body$|api[-_]?key/i;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  seen.add(value);

  // Errors log a fixed allow-list. Driver errors carry whole client objects as properties.
  if (value instanceof DatabaseError) {
    return { name: "DatabaseError", ...(value.code ? { code: value.code } : {}), ...(value.constraint ? { constraint: value.constraint } : {}) };
  }
  if (value instanceof DrizzleQueryError) {
    return { name: "DrizzleQueryError", ...(value.cause !== undefined ? { cause: redact(value.cause, depth + 1, seen) } : {}) };
  }
  if (value instanceof Error) {
    const { code, cause } = value as Error & { code?: unknown };
    return {
      name: value.name,
      message: value.message,
      ...(typeof code === "string" ? { code } : {}),
      ...(cause !== undefined ? { cause: redact(cause, depth + 1, seen) } : {}),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE.test(key) ? "[redacted]" : redact(item, depth + 1, seen);
  }
  return out;
}

type Level = "info" | "warn" | "error";

function write(level: Level, event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...(redact(fields) as object) });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Record<string, unknown> = {}) => write("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => write("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => write("error", event, fields),
};
