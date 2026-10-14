# 06 · Collaboration readiness

**Goal:** a junior can clone, run, and change the repo safely without asking you.

## Files
`README.md` (setup in five commands) · `AGENTS.md` (kept current) · `CLAUDE.md` (imports AGENTS.md) ·
`.github/workflows/ci.yml` · `.github/pull_request_template.md` · `CODEOWNERS` (optional)

## Steps
1. README: prerequisites, `cp .env.example .env.local`, `docker compose up -d`, `npm run db:migrate`, `npm run dev`
2. CI on every PR: install from lockfile, lint, typecheck, test against a Postgres service container, `npm audit --audit-level=high`
3. PR template: what changed, scenario IDs covered, how it was verified (paste output), new dependencies and why
4. CODEOWNERS: require a reviewer for `src/server/auth/` and `src/server/files/policy.ts`
5. Update AGENTS.md "Commands" whenever a script changes

## Scenarios
B6 (review queue), F10 (supply chain)

## Done when
- A fresh clone reaches a running app using only the README
- CI fails on a deliberately broken policy test
- AGENTS.md is under ~80 lines and every link resolves

## Narrate it
"The rules live in one file every agent and every person reads, and tool-specific files only point to it, so they cannot drift.
CI enforces the parts that matter most, because a written rule that nothing checks is a suggestion."
