import { connection } from "next/server";
import { pool } from "@/server/db/client";
import { checkReadiness } from "@/server/health";
import { log } from "@/server/log";

// GET /api/health: 200 when ready, 503 otherwise. The body never says what failed (F11).
export async function GET() {
  // Without this, Cache Components could prerender the check at build time.
  await connection();
  const readiness = await checkReadiness({ pool });
  if (readiness.ok) {
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  }
  log.warn("health.not_ready", { failed: readiness.failed });
  return Response.json(
    { status: "unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } },
  );
}
