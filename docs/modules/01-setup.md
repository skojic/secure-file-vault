# 01 · Setup

**Goal:** a running Next.js + PostgreSQL skeleton with validated config, migrations and a test harness.

## Files
`package.json` · `tsconfig.json` (strict) · `eslint.config.mjs` · `.nvmrc` · `.env.example` ·
`docker-compose.yml` · `drizzle.config.ts` · `src/env.ts` · `src/server/db/{client,schema}.ts` ·
`src/server/{errors,http,log}.ts` · `src/server/health.ts` · `src/app/api/health/route.ts` · `scripts/migrate.ts` · `vitest.config.mts`
(The admin seed needs password hashing, so it lives in [02-registration.md](02-registration.md).)

## Steps
1. Scaffold with `create-next-app` (TypeScript, App Router, ESLint, `src/`). Read the installed version's docs in `node_modules/next/dist/docs/` before writing code
2. Add PostgreSQL 17 to `docker-compose.yml` with a named volume and a healthcheck
3. Write `src/env.ts`: a Zod schema for every variable, parsed once, fails fast on startup
4. Install the ORM ([decisions/04](../decisions/04-orm.md)), create `schema.ts` with `users` only, generate and run the first migration
5. Cache the DB client on `globalThis` in development so hot reload does not open a new pool each time (B5)
6. Add `errors.ts` (typed errors) and `http.ts` (one error → status mapper)
7. Add `log.ts` with a redaction list (`password`, `cookie`, `authorization`)
8. Wire Vitest against a separate test database ([decisions/10](../decisions/10-test-database.md))
9. Timeouts on the pool: connection timeout and PostgreSQL `statement_timeout`, both from `env.ts`; a timeout maps to 503 with `Retry-After` in `http.ts` (F12)
10. `health.ts`: database answers, latest migration applied; `GET /api/health` returns 200 or 503 with no detail in the body (F11). Module 04 adds the `STORAGE_DIR` check
11. Add scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`

## Rules
22, 23, 28 in [security/rules.md](../security/rules.md)

## Scenarios
F7 (migration fails), F11 (dependency down), F12 (slow dependency), B5 (dev connection pool), E15 (missing env)

## Done when
- `docker compose up -d` then `npm run db:migrate` exits 0
- `npm run lint`, `npm run typecheck`, `npm test` exit 0
- A test proves `env.ts` throws on a missing `DATABASE_URL` and does not print its value
- With the database stopped, `/api/health` returns 503 and its body names nothing; a query past `statement_timeout` returns 503 and frees its connection

## Narrate it
"Config is validated once at the edge so nothing downstream ever reads a raw string from `process.env`.
The folder tree is the architecture: routes are thin, `server/` holds the rules, and a build fails if client code imports it."
