# 10 · Test database

**Question:** do service tests run against a real database?

## Option A — real PostgreSQL test database (default)
- **Why it would be better:** catches what mocks hide: unique constraints, `ON DELETE` behaviour, enum types, UUID casting errors (E16), the SQL scope on list queries. The policy and query tests are worth something only if the SQL actually runs
- **What could go wrong:** slower, needs Docker locally and a service container in CI. Tests must isolate data (transaction per test, or truncate between tests) or they become flaky. Run test files serially if they share one database

## Option B — mocked repositories, unit tests only
- **Why it would be better:** fast, no infrastructure, easy to run anywhere. Good for pure logic: `canAccessFile`, username normalisation, header encoding
- **What could go wrong:** the mock agrees with your assumptions, not with Postgres. A missing `WHERE uploader_id` passes every mocked test and leaks every file in production

## Default, and when to switch
Both, by layer: pure functions get unit tests; services and routes run against a real database. Never mock the database in a test that is meant to prove an access rule.

## Sources
- https://vitest.dev/guide/
- https://www.postgresql.org/docs/current/
