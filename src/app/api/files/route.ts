// PUT /api/files: one file per request, raw body (rule 11, decisions/06). This handler is the shape
// gate only; the service does the rest in order. Not covered by proxy.ts (rule 12).
import { z } from "zod";
import { env } from "@/env";
import { getCurrentUser } from "@/server/auth/current-user";
import { ForbiddenError, PayloadTooLargeError, UnauthorizedError, ValidationError } from "@/server/errors";
import { uploadFile } from "@/server/files/upload";
import { toErrorResponse } from "@/server/http";

const keySchema = z.uuid();

// Route handlers get no built-in Origin check, unlike Server Actions (rule 13).
function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new ForbiddenError("missing Origin");
  const forwardedHost = env.TRUST_PROXY_HEADERS ? request.headers.get("x-forwarded-host") : null;
  const expectedHost = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).host : (forwardedHost ?? request.headers.get("host"));
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("malformed Origin");
  }
  if (!expectedHost || originHost !== expectedHost) throw new ForbiddenError("foreign Origin");
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^\d{1,15}$/.test(raw)) throw new ValidationError({ file: "invalid_length" });
  return Number(raw);
}

function fileName(request: Request): string {
  const raw = request.headers.get("x-file-name");
  if (!raw) throw new ValidationError({ fileName: "required" });
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ValidationError({ fileName: "invalid" });
  }
}

export async function PUT(request: Request) {
  try {
    // Shape: everything checkable without the database or the body.
    checkOrigin(request);
    const length = declaredLength(request);
    if (length !== null && length > env.MAX_UPLOAD_BYTES) throw new PayloadTooLargeError("declared length exceeds the limit");
    const key = keySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) throw new ValidationError({ idempotencyKey: "required" });
    const name = fileName(request);

    // Identity, then the service.
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError("no session");
    if (!request.body) throw new ValidationError({ file: "empty" });

    const { id } = await uploadFile(user, { body: request.body, declaredLength: length, fileName: name, idempotencyKey: key.data, signal: request.signal });
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
