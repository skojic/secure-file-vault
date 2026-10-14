# 01 · Setup

**Goal:** a running Next.js + PostgreSQL skeleton with validated config, migrations and a test harness.

## Files
`package.json` · `tsconfig.json` (strict) · `eslint.config.mjs` · `.nvmrc` · `.env.example` ·
`docker-compose.yml` · `drizzle.config.ts` · `src/env.ts` · `src/server/db/{client,schema}.ts` ·
`src/server/{errors,http,log}.ts` · `scripts/{migrate,seed}.ts` · `vitest.config.mts`

## Steps
1. Scaffold with `create-next-app` (TypeScript, App Router, ESLint, `src/`). Read the installed version's docs in `node_modules/next/dist/docs/` before writing code
2. Add PostgreSQL 17 to `docker-compose.yml` with a named volume and a healthcheck
3. Write `src/env.ts`: a Zod schema for every variable, parsed once, fails fast on startup
4. Install the ORM ([decisions/04](../decisions/04-orm.md)), create `schema.ts` with `users` only, generate and run the first migration
5. Cache the DB client on `globalThis` in development so hot reload does not open a new pool each time (B5)
6. Add `errors.ts` (typed errors) and `http.ts` (one error → status mapper)
7. Add `log.ts` with a redaction list (`password`, `cookie`, `authorization`)
8. Wire Vitest against a separate test database ([decisions/10](../decisions/10-test-database.md))
9. Add scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`,
   and the guard: `guard` (`node scripts/guard/run.mjs`), `guard:final` (`… --final`), `test:guard` (`node --test 'scripts/guard/*.test.mjs'`)

## Rules
22, 23 in [security/rules.md](../security/rules.md)

## Scenarios
F7 (migration fails), F8 (seed twice), B5 (dev connection pool), E15 (missing env)

## Done when
- `docker compose up -d` then `npm run db:migrate` exits 0
- `npm run lint`, `npm run typecheck`, `npm test` exit 0
- A test proves `env.ts` throws on a missing `DATABASE_URL` and does not print its value
- Running `npm run db:seed` twice leaves exactly one admin

## Narrate it
"Config is validated once at the edge so nothing downstream ever reads a raw string from `process.env`.
The folder tree is the architecture: routes are thin, `server/` holds the rules, and a build fails if client code imports it."
