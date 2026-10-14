import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DependencyUnavailableError,
  ForbiddenError,
  KeyMismatchError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitedError,
  StorageFullError,
  UnauthorizedError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "@/server/errors";
import { NOT_FOUND_BODY, toErrorResponse } from "@/server/http";

describe("error → response mapping", () => {
  it.each([
    [new ValidationError({ name: "required" }), 400],
    [new UnauthorizedError(), 401],
    [new ForbiddenError(), 403],
    [new NotFoundError(), 404],
    [new ConflictError("in_progress", 3), 409],
    [new PayloadTooLargeError(), 413],
    [new UnsupportedMediaTypeError(), 415],
    [new KeyMismatchError(), 422],
    [new RateLimitedError(30), 429],
    [new DependencyUnavailableError("db"), 503],
    [new StorageFullError(), 507],
  ])("%s → %i", async (err, status) => {
    const res = toErrorResponse(err);
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("every NotFoundError has the same body, whatever its internal reason", async () => {
    const a = await toErrorResponse(new NotFoundError("forbidden")).json();
    const b = await toErrorResponse(new NotFoundError("missing")).json();
    expect(a).toEqual(NOT_FOUND_BODY);
    expect(b).toEqual(NOT_FOUND_BODY);
  });

  it("validation errors return field codes", async () => {
    const body = await toErrorResponse(new ValidationError({ username: "too_short" })).json();
    expect(body).toEqual({ error: "invalid_request", fields: { username: "too_short" } });
  });

  it("unknown errors are a generic 500 that does not echo the message", async () => {
    const res = toErrorResponse(new Error("relation users does not exist; password=hunter2"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("relation");
  });

  it("F12: a PostgreSQL statement timeout becomes 503 with Retry-After", () => {
    const pgTimeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    const wrapped = Object.assign(new Error("Failed query: select pg_sleep(5)"), { cause: pgTimeout });
    const res = toErrorResponse(wrapped);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
  });

  it("F11: a refused connection becomes 503", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });
    expect(toErrorResponse(refused).status).toBe(503);
  });

  it("429 and 409 carry Retry-After", () => {
    expect(toErrorResponse(new RateLimitedError(30)).headers.get("retry-after")).toBe("30");
    expect(toErrorResponse(new ConflictError("in_progress", 3)).headers.get("retry-after")).toBe("3");
    expect(toErrorResponse(new ConflictError("stale")).headers.get("retry-after")).toBeNull();
  });
});
