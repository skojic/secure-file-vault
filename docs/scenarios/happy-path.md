# Happy path (H)

The ideal flow. Each step is also an end-to-end test in `tests/e2e/happy-path.spec.ts`.

- **H1. Register** — Zod validates, username normalised, password hashed with argon2id, `staff` row inserted
  - **Test:** row exists, `role = 'staff'`, `password_hash` starts with `$argon2id$`
- **H2. Log in** — password verifies, old session deleted, new token in cookie, `sha256(token)` in `sessions`
  - **Test:** `Set-Cookie` has `HttpOnly` and `SameSite=Lax`; DB `id` ≠ cookie value
- **H3. Browse** — proxy sees a cookie and lets the request through; the page calls `getCurrentUser()`; the service lists files scoped in SQL
  - **Test:** staff sees only their own files; admin sees all
- **H4. Upload** — Origin checked, size checked, row `pending`, bytes streamed and sniffed, row `ready`
  - **Test:** response 201 with the file id; blob exists under a UUID key; row is `ready`
- **H5. Download** — user resolved, row loaded, `canAccessFile` passes, blob opened, streamed with safe headers
  - **Test:** bytes equal the upload; headers include `attachment`, `nosniff`, `no-store`
- **H6. Log out** — POST deletes the session row and clears the cookie
  - **Test:** the old cookie no longer resolves a user; the back button shows no cached file list

Every step has failure modes in [failures.md](failures.md) and edge cases in [edge-cases.md](edge-cases.md).
