# AGENTS.md — Secure File Vault

The single source of truth for anyone changing this repository, human or AI agent.
`CLAUDE.md` only imports this file. Detail lives in `docs/`; this file stays under ~80 lines.
If a rule blocks you, say so and fail loudly. Do not work around it silently.

## What this project is
A blueprint for a secure file upload module in a full-stack Next.js app:
- Register (name, username, password, role `admin` | `staff`), passwords stored as argon2id hashes
- Log in with username + password; the session is stored in PostgreSQL
- Upload files: metadata in PostgreSQL, bytes in a storage provider
- Only the uploader or an admin may list, view or download a file
- Admin can see each and everyone's files and the staff person can see just it's own
- When user gets deleted, files remain, but only admin can view, download, delete them

The repository starts as docs only. The app is built from these docs, module by module.

## Read before you change
- Requirements → [docs/brief.md](docs/brief.md)
- Folder layout, layering → [docs/architecture/overview.md](docs/architecture/overview.md)
- Tables and constraints → [docs/architecture/data-model.md](docs/architecture/data-model.md)
- The module you are building → [docs/modules/](docs/modules/) (one file per module, in build order)
- Anything auth, upload or download → [docs/security/rules.md](docs/security/rules.md) (binding)
- Why a tool was chosen → [docs/decisions/](docs/decisions/) (two options each)
- What can go wrong → [docs/scenarios/](docs/scenarios/) (IDs `H`, `F`, `E`, `B`)
- How to test it → [docs/testing/strategy.md](docs/testing/strategy.md)
- How to work with an agent → [docs/workflow/ai-workflow.md](docs/workflow/ai-workflow.md)
- How to comment code → [docs/workflow/narration.md](docs/workflow/narration.md)
- Official sources → [docs/references.md](docs/references.md)

## Five rules for every change
Summaries only. [docs/security/rules.md](docs/security/rules.md) is the binding version.
1. Authorize in the service layer on every request: `getCurrentUser()` plus a policy function. `proxy.ts` and hidden UI are not security.
2. File access is decided only by `canAccessFile(user, file)` in `src/server/files/policy.ts`.
3. Scope list queries in SQL (`WHERE uploader_id = :userId` for staff). Never filter after the query.
4. A file the user may not access returns **404**, never 403.
5. Never log or store secrets in plaintext: passwords, session tokens, file contents, request bodies.

## Layering in one line
`src/app/` (thin routes) → `src/server/<module>/service.ts` → `src/server/db`, `src/server/storage`.
Route handlers and Server Actions never touch the database or storage directly.

## Truth and sources
- Official documentation first. For Next.js, read `node_modules/next/dist/docs/` for the installed version.
- The installed version wins over memory, blog posts and these docs. Check `package-lock.json` or `node_modules`.
- Mark anything you did not check as *unverified* and name what would settle it.
- "Done" means the command ran and you quote its output. Writing code is not done.

## Working loop (details in docs/workflow/ai-workflow.md)
1. **Plan:** write `plans/<module>.md` ([format](plans/README.md)). A person approves it; you never do.
2. **Build** the smallest vertical slice, only in the plan's files. One module per PR.
3. **Verify:** `node scripts/guard/run.mjs --final` must pass (lint, typecheck, test, scope, scenarios). Quote it.
4. **Narrate:** comment the code per `docs/workflow/narration.md`.
New session: read `.guard/handoff/<module>.md` first; it is generated from git and the gate ledger.

## Commands (created in docs/modules/01-setup.md; update this list when scripts change)
- `docker compose up -d` — start PostgreSQL
- `npm run dev` — dev server
- `npm run db:generate` / `npm run db:migrate` — migrations
- `npm run db:seed` — first admin from env vars
- `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:e2e`
- `node scripts/guard/run.mjs [--final]` — gates + ledger · `check-plan.mjs` · `scenarios-for.mjs <module>`

## Hard limits
- No new dependency without a reason in the PR description.
- Human review for any change under `src/server/auth/`, `src/server/files/policy.ts`, or upload/download handlers.
- Every policy rule ships with four tests: uploader allowed, admin allowed, other staff denied, anonymous denied.
- No AI or tool attribution in commits, PRs, comments or docs.

## Skills
- `deslop` (`.claude/skills/deslop/`) strips narration comments and keeps only the key ones. Self-contained; can be copied to any repo.
