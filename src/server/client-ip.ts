// The client address for rate limiting (decisions/09). X-Forwarded-For is client-controlled unless a
// known proxy sets it, so it is read only when TRUST_PROXY_HEADERS is on, and then the last entry is
// used: the one our proxy appended, not whatever the client sent first.
import "server-only";
import { env } from "@/env";

export function clientIp(headers: Headers): string | null {
  if (!env.TRUST_PROXY_HEADERS) return null;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || null;
}
