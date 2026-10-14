// Opaque database sessions (decisions/02, rules 8–9). The cookie holds 32 random bytes; the table
// holds their SHA-256. Expiry is server-side and sliding: extended only when less than half remains (B3).
// The cookie has no Max-Age: cookies cannot be rewritten while a page renders, so the database decides.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { env } from "@/env";
import { SESSION_COOKIE_DEVELOPMENT, SESSION_COOKIE_PRODUCTION } from "@/lib/session-cookie";
import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { purgeExpiredKeys } from "@/server/idempotency";
import { purgeOldWindows } from "@/server/rate-limit";

export type CookieOptions = { httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none"; path?: string; maxAge?: number };

// The subset of Next's cookie store that sessions use; tests pass an in-memory one.
export type CookieJar = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string): void;
};

export type CurrentUser = { id: string; name: string; username: string; role: "admin" | "staff" };

const isProduction = env.NODE_ENV === "production";

// The __Host- prefix makes the browser refuse the cookie unless it is Secure, Path=/ and has no Domain.
export const SESSION_COOKIE = isProduction ? SESSION_COOKIE_PRODUCTION : SESSION_COOKIE_DEVELOPMENT;

const COOKIE_OPTIONS: CookieOptions = { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" };

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, jar: CookieJar): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: sql`now() + make_interval(secs => ${env.SESSION_TTL_SECONDS})`,
  });
  jar.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

// Null for "not logged in". A database error propagates, so a failed lookup is never anonymous (F3).
export async function resolveSession(token: string): Promise<CurrentUser | null> {
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      // Role comes from users on every request, never from the session (rule 5, E6).
      role: users.role,
      needsExtension: sql<boolean>`${sessions.expiresAt} < now() + make_interval(secs => ${env.SESSION_TTL_SECONDS / 2})`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), sql`${sessions.expiresAt} > now()`, isNull(users.disabledAt)));
  if (!row) return null;

  if (row.needsExtension) {
    await db
      .update(sessions)
      .set({ expiresAt: sql`now() + make_interval(secs => ${env.SESSION_TTL_SECONDS})` })
      .where(eq(sessions.id, id));
  }
  return { id: row.id, name: row.name, username: row.username, role: row.role };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function clearSessionCookie(jar: CookieJar): void {
  jar.delete(SESSION_COOKIE);
}

// Housekeeping run on login (E7): expired sessions, old rate-limit windows, expired idempotency keys.
export async function purgeExpired(): Promise<void> {
  await db.delete(sessions).where(sql`${sessions.expiresAt} <= now()`);
  await purgeOldWindows(Math.max(env.LOGIN_WINDOW_SECONDS, 3600));
  await purgeExpiredKeys();
}
