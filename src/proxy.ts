// Optimistic redirects only, NOT an auth boundary (rule 1). It sees whether a session cookie exists,
// not whether it is valid; every page, Server Action and route handler checks the session itself.
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/session-cookie";

export function proxy(request: NextRequest) {
  if (SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

// Pages only. /api is never matched, so upload bodies are never buffered by the proxy (rule 12, E14).
export const config = {
  matcher: ["/files/:path*", "/admin/:path*"],
};
