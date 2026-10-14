# Security rules (binding)

Summarised in [AGENTS.md](../../AGENTS.md). If the two disagree, this file wins.

## Authorization
1. Every Server Action and route handler calls `getCurrentUser()` and the relevant policy function. Proxy and hidden UI are convenience only.
2. `canAccessFile(user, file)` in `src/server/files/policy.ts` is the only access rule: `user.id === file.uploaderId || user.role === "admin"`. Anonymous is always false.
3. Staff list queries include `WHERE uploader_id = :userId` in SQL. Never filter in JS after the query.
4. Inaccessible, missing and malformed-id files all return the same **404** with the same body.
5. Role is read from `users` on every request. Never cache it in the cookie or session row.

## Accounts and sessions
6. Passwords: argon2id, OWASP minimum `m=19456 KiB, t=2, p=1`. Length 12–128 characters, checked in Zod before hashing.
7. Self-registration always creates `staff`. Only the seed script or an existing admin creates an `admin`.
8. Session token: 32 random bytes, base64url, in a cookie with `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`. Store only `sha256(token)`.
9. Rotate the session on login, delete it on logout (POST only), expire it server-side. Disabling a user deletes all their sessions.
10. Login errors are generic. A missing user still runs one argon2 verify against a dummy hash (timing, E2).

## Uploads
11. Upload goes through `PUT /api/files` with a raw body, one file per request. Not through a Server Action (1 MB default body limit).
12. Exclude the upload route from the `proxy.ts` matcher. Proxy buffers request bodies up to `proxyClientMaxBodySize` (10 MB default) and logs a warning beyond it.
13. Reject a mismatched or missing `Origin` header on the upload route. Route handlers do not get the Server Action origin check.
14. Enforce `MAX_UPLOAD_BYTES` twice: reject a large `Content-Length` up front, and count bytes while streaming.
15. Detect the type from the first bytes against an allow-list. Never trust the client `Content-Type` or the extension. Never allow HTML, SVG or XML.
16. Storage key is a server-generated UUID. The original name is metadata only; strip control characters, cap at 255.
17. Row first as `pending`, then bytes, then `ready`. On any failure delete both. Nothing is visible until `ready`.
18. Never serve uploads from `public/` or any guessable URL.

## Downloads
19. Stream through an authorized route handler. Open the blob before sending headers; a missing blob is 404, never a truncated 200.
20. Headers: `Content-Disposition: attachment` with RFC 6266 `filename*`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, the stored content type.
21. Presigned URLs, if added, are short-lived and issued only after the policy check.

## Configuration and logging
22. `src/env.ts` is the only reader of `process.env`, validated with Zod at startup. Secrets live in `.env.local`; `.env.example` lists every key with dummy values.
23. Logs are structured and redact `password`, `cookie`, `authorization` and bodies. Denied file access is logged as user id + file id, nothing else.
