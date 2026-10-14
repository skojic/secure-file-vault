# Decisions

Every technical choice gets two serious options. Each option says why it would be better and what could go wrong.
The default is a starting point, not a verdict. Change it by editing the file and noting the date and the reason.

1. [01-auth-library.md](01-auth-library.md) — own the auth code vs Better Auth
2. [02-session-strategy.md](02-session-strategy.md) — DB sessions vs stateless JWT
3. [03-password-hashing.md](03-password-hashing.md) — argon2id vs bcrypt
4. [04-orm.md](04-orm.md) — Drizzle vs Prisma
5. [05-storage-provider.md](05-storage-provider.md) — local disk behind an interface vs S3-compatible from day one
6. [06-upload-transport.md](06-upload-transport.md) — raw-body route handler vs multipart form
7. [07-download-delivery.md](07-download-delivery.md) — stream through the app vs presigned URLs
8. [08-registration-and-roles.md](08-registration-and-roles.md) — invite-only vs open registration
9. [09-rate-limiting.md](09-rate-limiting.md) — Postgres counter vs Redis
10. [10-test-database.md](10-test-database.md) — real Postgres vs mocked repositories
11. [11-deployment-target.md](11-deployment-target.md) — container with a volume vs serverless platform

## File format
```
# NN · Topic
**Question:** one line
## Option A — name (default)
- Why it would be better
- What could go wrong
## Option B — name
- Why it would be better
- What could go wrong
## Default, and when to switch
## Sources
```

## Rule for agents
Do not change a default silently. Propose the change, cite the official docs for the installed version, and wait for approval.
