# 04 · ORM

**Question:** how does TypeScript talk to PostgreSQL?

## Option A — Drizzle ORM + drizzle-kit (default)
- **Why it would be better:** schema is TypeScript, queries read like SQL, migrations are plain SQL files a reviewer can read. No code generation step, small runtime. Juniors learn SQL instead of an abstraction over it
- **What could go wrong:** pre-1.0 (`latest` 0.45.4; 1.0 is in RC, npm 2026-10-14), so APIs may change at 1.0. Fewer guard rails: it is easy to write a query that forgets the `uploader_id` scope. No GUI as polished as Prisma Studio

## Option B — Prisma
- **Why it would be better:** best onboarding of the two, a readable schema language, Prisma Studio for browsing data, strong docs including a Next.js guide. Mature migration workflow
- **What could go wrong:** a generated client and its own schema language: one more thing to learn and to keep in sync. On 2026-10-14 its npm `latest` tag pointed to a release candidate (`8.0.0-rc.22`, previous stable `7.10.0`), so a bare `npm install prisma` installs an RC; pin the version

## Default, and when to switch
Drizzle, for readable SQL migrations on a security-sensitive schema. Choose Prisma if the team already knows it. Never run both.

## Sources
- https://orm.drizzle.team/docs/get-started-postgresql
- https://orm.drizzle.team/docs/migrations
- https://www.prisma.io/docs/guides/nextjs
- https://www.prisma.io/docs/orm/prisma-migrate
