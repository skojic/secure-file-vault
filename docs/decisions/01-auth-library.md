# 01 · Auth library

**Question:** write the auth layer ourselves, or use a library?

## Option A — own it, ~150 lines (default)
- **Why it would be better:** the scope is small (username/password, two roles). Every security decision sits in code a reviewer can read in ten minutes, and the Next.js authentication guide documents this exact pattern (session table, DAL, `cookies()`). Strong interview material: you can explain every line
- **What could go wrong:** you own the bugs. A missed detail (timing, rotation, cookie flags) is yours to find. Every later feature (OAuth, 2FA, password reset) is extra work

## Option B — Better Auth
- **Why it would be better:** a maintained library with a username plugin, sessions in your own database, and a path to OAuth, 2FA and organisations without a rewrite. Fewer hand-written security paths
- **What could go wrong:** you inherit its schema and conventions; upgrades can change tables. The security logic is less visible to reviewers. Version moves fast (npm `latest` 1.7.7 on 2026-10-14), so pin and read release notes

## Rejected: Auth.js (next-auth)
Its credentials-provider page opens with a warning against username/password, v5 is still tagged `beta` (5.0.0-beta.32) and `latest` is 4.24.15 (npm, 2026-10-14).

## Default, and when to switch
Own it. Switch to Better Auth the day SSO, OAuth or 2FA becomes a requirement. Keep `getCurrentUser()` as the only entry point so the swap stays local.

## Sources
- https://nextjs.org/docs/app/guides/authentication
- https://www.better-auth.com/docs/plugins/username
- https://authjs.dev/getting-started/authentication/credentials
