// Typed errors thrown by services. http.ts maps each to one status and one body, so routes never
// decide status codes themselves.
import "server-only";

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = "invalid_request";
  constructor(readonly fields: Record<string, string> = {}) {
    super("invalid request");
  }
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  readonly code = "unauthorized";
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = "forbidden";
}

// `reason` is for logs only. Forbidden, missing and malformed all leave as the same 404 (rule 4).
export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = "not_found";
  constructor(readonly reason: "missing" | "forbidden" | "malformed" = "missing") {
    super("not found");
  }
}

// "in_progress": the same idempotency key is still running. "stale": the record changed since the user saw it.
export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = "conflict";
  constructor(
    readonly reason: "in_progress" | "stale",
    readonly retryAfterSeconds?: number,
  ) {
    super(reason);
  }
}

export class PayloadTooLargeError extends AppError {
  readonly status = 413;
  readonly code = "payload_too_large";
}

export class UnsupportedMediaTypeError extends AppError {
  readonly status = 415;
  readonly code = "unsupported_media_type";
}

// The idempotency key belongs to a different user, route or request.
export class KeyMismatchError extends AppError {
  readonly status = 422;
  readonly code = "idempotency_key_mismatch";
}

export class RateLimitedError extends AppError {
  readonly status = 429;
  readonly code = "rate_limited";
  constructor(readonly retryAfterSeconds: number) {
    super("rate limited");
  }
}

export class DependencyUnavailableError extends AppError {
  readonly status = 503;
  readonly code = "unavailable";
  constructor(
    readonly dependency: "db" | "storage",
    readonly retryAfterSeconds = 5,
  ) {
    super(`${dependency} unavailable`);
  }
}

export class StorageFullError extends AppError {
  readonly status = 507;
  readonly code = "insufficient_storage";
}
