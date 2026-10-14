// Turns service errors into form state for Server Actions, the way http.ts does for route handlers.
// Messages are fixed strings; nothing from the error itself reaches the user.
import "server-only";
import { ConflictError, DependencyUnavailableError, ForbiddenError, KeyMismatchError, RateLimitedError, UnauthorizedError, ValidationError } from "./errors";
import { isDependencyFailure } from "./http";
import { log } from "./log";

export type FormState = {
  status: "idle" | "error";
  message?: string;
  fields?: Record<string, string>;
};

export function toFormState(err: unknown): FormState {
  if (err instanceof ValidationError) {
    const { form, ...fields } = err.fields;
    return {
      status: "error",
      message: form ? "We could not complete this with the details given." : "Check the highlighted fields.",
      fields,
    };
  }
  if (err instanceof UnauthorizedError) return { status: "error", message: "Incorrect username or password." };
  if (err instanceof ForbiddenError) return { status: "error", message: "This action is not available." };
  if (err instanceof KeyMismatchError) return { status: "error", message: "This form was already used for a different request. Reload the page and try again." };
  if (err instanceof ConflictError) {
    return {
      status: "error",
      message: err.reason === "in_progress" ? "Your earlier request is still being processed. Wait a moment, then try again." : "This item changed since you opened it. Reload to see the current version.",
    };
  }
  if (err instanceof RateLimitedError) return { status: "error", message: "Too many attempts. Wait a minute and try again." };
  if (err instanceof DependencyUnavailableError || isDependencyFailure(err)) {
    log.error("action.dependency_unavailable", { err });
    return { status: "error", message: "The service is temporarily unavailable. Try again shortly." };
  }
  log.error("action.failed", { err });
  return { status: "error", message: "Something went wrong. Try again." };
}
