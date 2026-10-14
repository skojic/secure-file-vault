# Modules

Build in this order. Each module is one PR and ends with its "Done when" tests passing.

1. [01-setup.md](01-setup.md) — scaffold, tooling, env, database, test harness
2. [02-registration.md](02-registration.md) — create users with hashed passwords
3. [03-login-sessions.md](03-login-sessions.md) — login, sessions, `getCurrentUser()`, logout
4. [04-file-upload.md](04-file-upload.md) — streaming upload, type sniffing, storage
5. [05-file-access.md](05-file-access.md) — policy, list, download
6. [06-collaboration.md](06-collaboration.md) — conventions, CI, handover docs

## Every module file has the same sections
- **Goal** — one sentence
- **Files** — what gets created
- **Steps** — build order
- **Rules** — which security rules apply
- **Scenarios** — IDs from `docs/scenarios/` this module must handle
- **Done when** — tests and commands that prove it
- **Narrate it** — the two-sentence explanation for a junior or an interviewer

If a time box is tight, modules 4 and 5 can ship as stubs behind their interfaces. Module 5's policy and its four tests never get stubbed.
