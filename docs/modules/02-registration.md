# 02 · Registration

**Goal:** create users with `name`, `username`, `password`, `role`, storing only an argon2id hash.

## Files
`src/server/auth/password.ts` · `src/server/auth/service.ts` (`registerUser`) · `src/lib/username.ts` ·
`src/lib/schemas/registration.ts` (shared by form and server) · `src/server/idempotency.ts` ·
`src/app/(auth)/register/page.tsx` + a Server Action · `scripts/seed.ts` · `tests/auth/registration.test.ts`

## Steps
1. `username.ts`: trim → NFKC → lowercase → match `^[a-z0-9._-]{3,32}$`
2. Zod schema in `src/lib/schemas/registration.ts`: name 1–100, username via `username.ts`, password 12–128. The form validates with it before submitting and disables submit while pending; the Server Action parses with it again (rules 25, 29)
3. `idempotency.ts`: `claim(key, userId, route, requestHash)` → `run` | `replay(result)` | `inProgress` | `mismatch`, `complete(key, result)`, `release(key)`; table per [data-model.md](../architecture/data-model.md). The form sends a hidden `idempotencyKey` from `crypto.randomUUID()`, kept across retries (E20, E21)
4. `password.ts`: `hashPassword`, `verifyPassword`, `verifyAgainstDummy`. Concurrency cap on hashing (F6)
5. `registerUser`: role is always `staff` for self-registration; `admin` only from seed or an admin action
6. Unique-violation on username maps to a `ValidationError`, not a 500
7. `scripts/seed.ts` + `db:seed` script: creates the first admin from `SEED_ADMIN_*` env vars with `hashPassword`; no-op if any admin exists; no default password (F8)
8. Optional: invite codes (`REGISTRATION_MODE=invite|open|closed`) per [decisions/08](../decisions/08-registration-and-roles.md)

## Rules
6, 7, 24–26, 29 in [security/rules.md](../security/rules.md)

## Scenarios
H1, E1 (username normalisation), E3 (enumeration on register), E4 (password bounds), E5 (bcrypt 72-byte limit, if bcrypt is chosen), F8 (seed twice), E20 (double submit), E21 (key reuse)

## Done when
- Stored hash starts with `$argon2id$` and never equals the input
- A request with `role: "admin"` from a visitor creates `staff`
- `Admin`, ` admin ` and fullwidth `ａｄｍｉｎ` collide with `admin`
- Passwords of 11 and 129 characters are rejected before hashing
- Running `npm run db:seed` twice leaves exactly one admin; without `SEED_ADMIN_PASSWORD` it exits non-zero
- Submitting the same registration twice with one key creates one user and returns the same result both times; the same key with a different username returns 422

## Gotcha (checked in `@node-rs/argon2` 2.2.2 `index.d.ts`)
`Algorithm` is a `const enum`. With `isolatedModules` it cannot be imported; pass `algorithm: 2` (Argon2id) with a comment.

## Narrate it
"We hash with argon2id because it is memory-hard, so GPU guessing is expensive; parameters come from OWASP, not from memory.
The client never chooses its own role, because if it could, the admin rule would mean nothing."
