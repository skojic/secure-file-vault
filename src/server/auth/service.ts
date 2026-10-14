// Account creation. Self-registration always creates `staff` (rule 7); only the seed creates the
// first admin. Registration is keyed (rule 26) so a double submit creates one account.
import "server-only";
import { eq, sql } from "drizzle-orm";
import { env } from "@/env";
import { fieldCodes, type RegistrationInput, registrationSchema } from "@/lib/schemas/registration";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { requestHash, withIdempotency } from "@/server/idempotency";

const REGISTER_ROUTE = "auth.register";

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
