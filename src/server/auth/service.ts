// Account creation. Self-registration always creates `staff` (rule 7); only the seed creates the
// first admin. Registration is keyed (rule 26) so a double submit creates one account.
import "server-only";
import { eq, sql } from "drizzle-orm";
import { env } from "@/env";
import { fieldCodes, type RegistrationInput, registrationSchema } from "@/lib/schemas/registration";
import { type LoginInput, loginSchema } from "@/lib/schemas/login";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/auth/password";
import {
  clearSessionCookie,
  type CookieJar,
  createSession,
  type CurrentUser,
  deleteSession,
  purgeExpired,
  resolveSession,
  SESSION_COOKIE,
} from "@/server/auth/session";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/server/errors";
import { requestHash, withIdempotency } from "@/server/idempotency";
import { hit } from "@/server/rate-limit";

const REGISTER_ROUTE = "auth.register";
const INVALID_CREDENTIALS = "invalid credentials";

// PostgreSQL 23505 unique_violation, possibly wrapped by Drizzle.
function isUniqueViolation(err: unknown): boolean {
  for (let e = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

// The service parses again even when the caller already did: normalisation (E1) and the password
// bounds (E4) must hold for every caller, not only the form.
function parseRegistration(raw: RegistrationInput): RegistrationInput {
  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldCodes(parsed.error));
  return parsed.data;
}

export async function registerUser(raw: RegistrationInput, idempotencyKey: string): Promise<{ userId: string; replayed: boolean }> {
  if (env.REGISTRATION_MODE === "closed") throw new ForbiddenError("registration is closed");
  const input = parseRegistration(raw);

  const result = await withIdempotency(
    {
      key: idempotencyKey,
      userId: null,
      route: REGISTER_ROUTE,
      // The password stays out of the hash: an unsalted digest of it in the database would be guessable.
      requestHash: requestHash(REGISTER_ROUTE, { name: input.name, username: input.username }),
      staleAfterSeconds: 60,
    },
    async () => {
      const passwordHash = await hashPassword(input.password);
      try {
        const [row] = await db
          .insert(users)
          .values({ name: input.name, username: input.username, passwordHash, role: "staff" })
          .returning({ id: users.id });
        return { status: 201, body: { userId: row.id } };
      } catch (err) {
        // Generic on purpose: open registration must not confirm that a username exists (E3).
        if (isUniqueViolation(err)) throw new ValidationError({ form: "registration_failed" });
        throw err;
      }
    },
  );
  return { userId: (result.body as { userId: string }).userId, replayed: result.replayed };
}

// Gate order (rule 24): shape → rate limit → credentials → session. Unknown user, wrong password and
// disabled account all cost one argon2 verify and fail with the same error (rule 10, E2).
export async function login(raw: LoginInput, ctx: { jar: CookieJar; ip: string | null }): Promise<CurrentUser> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) throw new UnauthorizedError(INVALID_CREDENTIALS);
  const { username, password } = parsed.data;

  // Before any hashing: a rejected attempt costs one upsert, not 19 MiB (F6).
  if (ctx.ip) await hit("login:ip", ctx.ip, env.LOGIN_LIMIT_PER_IP, env.LOGIN_WINDOW_SECONDS);
  await hit("login:username", username, env.LOGIN_LIMIT_PER_USERNAME, env.LOGIN_WINDOW_SECONDS);

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.username, username));
  const valid = user ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);
  if (!user || !valid || user.disabledAt) throw new UnauthorizedError(INVALID_CREDENTIALS);

  // Rotate: the session this browser had before login is deleted (rule 9).
  const previous = ctx.jar.get(SESSION_COOKIE)?.value;
  if (previous) await deleteSession(previous);
  await purgeExpired();
  await createSession(user.id, ctx.jar);

  const current = await resolveSession(ctx.jar.get(SESSION_COOKIE)!.value);
  if (!current) throw new UnauthorizedError(INVALID_CREDENTIALS);
  return current;
}

export async function logout(jar: CookieJar): Promise<void> {
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  clearSessionCookie(jar);
}

// Creates the first admin unless one exists (F8). The advisory lock makes two concurrent seeds
// behave like one.
export async function ensureFirstAdmin(raw: RegistrationInput): Promise<{ created: boolean }> {
  const input = parseRegistration(raw);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('seed:first-admin'))`);
    const existing = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    if (existing.length > 0) return { created: false };
    await tx.insert(users).values({ name: input.name, username: input.username, passwordHash, role: "admin" });
    return { created: true };
  });
}
