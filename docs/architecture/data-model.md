# Data model

All timestamps are `timestamptz`. "Now" is the database's `now()`, never the app clock.

## users
- `id` uuid pk · `name` text · `username` text **unique** (stored normalised, see E1)
- `password_hash` text · `role` enum(`admin`, `staff`) · `disabled_at` timestamptz null
- `created_at`, `updated_at`
- Users are disabled, never hard-deleted ([decisions/08](../decisions/08-registration-and-roles.md))

## sessions
- `id` text pk = `sha256(token)` hex. The raw token lives only in the cookie
- `user_id` → users **on delete cascade** · `expires_at` · `created_at`
- Index `(user_id)`, `(expires_at)`

## files
- `id` uuid pk · `original_name` text (metadata only, never a path) · `size_bytes` bigint (`mode: "number"`)
- `content_type` text (detected from bytes) · `storage_key` uuid **unique** (server-generated)
- `status` enum(`pending`, `ready`) · `uploader_id` → users **on delete restrict**
- `created_at`, `updated_at`
- Index `(uploader_id, created_at desc, id desc)` for staff lists, `(created_at desc, id desc)` for admin lists
- Every read filters `status = 'ready'` inside the service

## Optional, added when the module needs them
- `invites` (code_hash, created_by, expires_at, used_at) — invite-only registration
- `rate_limits` (key, window_start, count) — Postgres-backed limiter ([decisions/09](../decisions/09-rate-limiting.md))
- `file_events` (file_id, user_id, action `upload|download|denied`, created_at) — audit trail

## Migration rules
1. Edit `src/server/db/schema.ts`
2. `npm run db:generate`, then read the generated SQL
3. Commit schema and migration together
4. Never edit an applied migration; write a new one
