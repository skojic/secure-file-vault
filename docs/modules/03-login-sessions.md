# 03 · Login and sessions

**Goal:** username + password login that creates a revocable DB session, plus `getCurrentUser()` and logout.

## Files
`src/server/auth/session.ts` · `src/server/auth/current-user.ts` · `src/server/auth/service.ts` (`login`, `logout`) ·
`src/app/(auth)/login/page.tsx` + Server Action · `src/proxy.ts` · `tests/auth/login.test.ts`

## Steps
1. `session.ts`: `createSession(userId)` → 32 random bytes as base64url; store `sha256(token)` with `expires_at`
2. Set the cookie with `(await cookies()).set(...)` using the flags in rule 8
3. `login`: normalise username → load user → verify (or dummy verify if missing) → reject if disabled → delete old session → create new
4. `getCurrentUser()`: wrap in React `cache()` so one render does one lookup. Join session → user, check `expires_at > now()` and `disabled_at is null`
5. `null` means "not logged in". A DB error throws and becomes 503. Never fall back to anonymous (F3)
6. Sliding expiry: extend only when less than half the lifetime remains (B3)
7. `logout` is a POST Server Action: delete the row, clear the cookie
8. `proxy.ts`: redirect to `/login` if no cookie. Exclude `/api/files` from the matcher (rule 12)

## Rules
5, 8, 9, 10, 12, 24, 25 in [security/rules.md](../security/rules.md)

## Scenarios
H2, H3, H6, F3 (DB down), F6 (login burst), E2 (timing), E6 (role change mid-session), E7 (expired rows), E8 (logout CSRF), B2, B3

## Done when
- Wrong password and unknown user return the same message and status
- The DB row holds a hash; the cookie value never appears in the DB or logs
- Disabling a user makes their next request anonymous
- An expired session returns `null` from `getCurrentUser()`
- Logout via GET does nothing

## Narrate it
"The cookie holds a random token and the database holds its hash, so a database leak does not hand out live sessions.
Sessions live in the database because we need to revoke them instantly when someone is disabled; a JWT stays valid until it expires."
