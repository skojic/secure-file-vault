// One place that turns an error into a response. Bodies carry a code, never an internal message.
import "server-only";
import { AppError, ConflictError, DependencyUnavailableError, NotFoundError, RateLimitedError, ValidationError } from "./errors";
import { log } from "./log";

export const NOT_FOUND_BODY = { error: "not_found" } as const;

// PostgreSQL SQLSTATEs and Node socket codes that mean "the dependency is unavailable", not "the request is wrong".
// 57014 query_canceled (statement_timeout), 57P01-57P03 shutdown / cannot connect now, class 08 connection exceptions.
const DEPENDENCY_CODES = new Set(["57014", "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH"]);
const DEPENDENCY_MESSAGES = [/timeout exceeded when trying to connect/i, /connection terminated/i];

// Drizzle wraps driver errors; walk the cause chain.
export function isDependencyFailure(err: unknown): boolean {
  for (let e = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && DEPENDENCY_CODES.has(code)) return true;
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && DEPENDENCY_MESSAGES.some((re) => re.test(message))) return true;
  }
  return false;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof NotFoundError) return json(404, NOT_FOUND_BODY);
  if (err instanceof ValidationError) return json(400, { error: err.code, fields: err.fields });
  if (err instanceof RateLimitedError || err instanceof DependencyUnavailableError) {
    return json(err.status, { error: err.code }, { "Retry-After": String(err.retryAfterSeconds) });
  }
  if (err instanceof ConflictError) {
    const headers: Record<string, string> = err.retryAfterSeconds ? { "Retry-After": String(err.retryAfterSeconds) } : {};
    return json(409, { error: err.code, reason: err.reason }, headers);
  }
  if (err instanceof AppError) return json(err.status, { error: err.code });

  if (isDependencyFailure(err)) {
    log.error("dependency.unavailable", { err });
    return json(503, { error: "unavailable" }, { "Retry-After": "5" });
  }
  log.error("request.failed", { err });
  return json(500, { error: "internal_error" });
}
