# 02 · Registration

**Goal:** create users with `name`, `username`, `password`, `role`, storing only an argon2id hash.

## Files
`src/server/auth/password.ts` · `src/server/auth/service.ts` (`registerUser`) · `src/lib/username.ts` ·
`src/app/(auth)/register/page.tsx` + a Server Action · `tests/auth/registration.test.ts`

## Steps
1. `username.ts`: trim → NFKC → lowercase → match `^[a-z0-9._-]{3,32}$`
2. Zod schema: name 1–100, username via `username.ts`, password 12–128
3. `password.ts`: `hashPassword`, `verifyPassword`, `verifyAgainstDummy`. Concurrency cap on hashing (F6)
4. `registerUser`: role is always `staff` for self-registration; `admin` only from seed or an admin action
5. Unique-violation on username maps to a `ValidationError`, not a 500
6. Optional: invite codes (`REGISTRATION_MODE=invite|open|closed`) per [decisions/08](../decisions/08-registration-and-roles.md)

## Rules
6, 7 in [security/rules.md](../security/rules.md)

## Scenarios
H1, E1 (username normalisation), E3 (enumeration on register), E4 (password bounds), E5 (bcrypt 72-byte limit, if bcrypt is chosen)

## Done when
- Stored hash starts with `$argon2id$` and never equals the input
- A request with `role: "admin"` from a visitor creates `staff`
- `Admin`, ` admin ` and fullwidth `ａｄｍｉｎ` collide with `admin`
- Passwords of 11 and 129 characters are rejected before hashing

## Gotcha (checked in `@node-rs/argon2` 2.2.2 `index.d.ts`)
`Algorithm` is a `const enum`. With `isolatedModules` it cannot be imported; pass `algorithm: 2` (Argon2id) with a comment.

## Narrate it
"We hash with argon2id because it is memory-hard, so GPU guessing is expensive; parameters come from OWASP, not from memory.
The client never chooses its own role, because if it could, the admin rule would mean nothing."
