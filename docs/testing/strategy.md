# Testing strategy

## Layers
- **Unit (Vitest):** pure functions, no I/O: `canAccessFile`, username normalisation, `Content-Disposition` builder, allow-list matching
- **Integration (Vitest + real PostgreSQL):** services and route handlers called directly with a `Request`. Proves SQL scoping, constraints and error mapping ([decisions/10](../decisions/10-test-database.md))
- **End-to-end (Playwright):** the happy path H1–H6 in a browser, plus one denied-access check

## Test database
- Separate database (`DATABASE_URL_TEST`), migrated once before the run
- Isolation: truncate tables between tests, or wrap each test in a transaction rolled back at the end
- Storage: a temp directory per test run, deleted after; never the dev `STORAGE_DIR`
- Run integration files serially if they share one database

## Naming
`tests/<module>/<unit>.test.ts`. Test names carry the scenario ID so a failure points to the doc:
`it("E16: non-UUID id returns the standard 404")`

## Required matrix (a PR is not done without its rows)
- **Policy (every rule):** uploader allowed · admin allowed · other staff denied · anonymous denied
- **Download:** forbidden, missing and malformed id return the same status and body
- **List:** staff list contains only own files, with other users' rows seeded
- **Auth:** generic login error · dummy verify on unknown user · disabled user loses session · logout is POST only
- **Upload:** `MAX` ok · `MAX+1` rejected with and without `Content-Length` · spoofed type rejected · abort leaves nothing · foreign `Origin` rejected
- **Config:** missing env var fails with its name, not its value
- **Requests:** same key twice → one effect, same result · same key, different request or user → 422 · stale `updated_at` → 409 · dependency down or past its timeout → 503 and nothing written

## Commands
- `npm test` — unit + integration
- `npm run test:e2e` — Playwright (starts the app)
- CI runs both against a PostgreSQL service container ([modules/06](../modules/06-collaboration.md))

## Rules for agents writing tests
- Write the policy tests before the policy
- A test that cannot fail is not a test: break the code once, watch it fail, restore it
- Never mock the database in a test that proves an access rule
- Quote the test runner's summary line when reporting results
