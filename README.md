# Secure File Vault

A reusable AI workflow for building a secure file upload module: Next.js (TypeScript) + PostgreSQL,
with registration, login, uploads and owner-or-admin access rules.

The repository is a set of short, linked Markdown files that a coding agent (or a person) follows
to build the app one module at a time. Each module says what to build, which rules apply,
which failure scenarios it must handle, and which tests prove it.

## Use it with
- **Claude Code CLI:** run `claude` in this folder. `CLAUDE.md` imports `AGENTS.md`.
- **Claude Code Desktop:** open this folder as the project. Same files, same behaviour.
- **Warp, Codex, Cursor, Gemini CLI and others:** they read `AGENTS.md` directly.
- **Skills:** `.claude/skills/` is read by Claude Code and by Warp.

## Layout
```
AGENTS.md                 rules for every agent (start here)
CLAUDE.md                 Claude Code entry point, imports AGENTS.md
docs/
  brief.md                requirements
  architecture/           folder layout, layering, data model
  modules/                one file per module, in build order
  security/rules.md       binding security rules
  decisions/              each choice with two options and what could go wrong
  scenarios/              happy path, failures, edge cases, bottlenecks
  testing/strategy.md     test layers and the required test matrix
  workflow/               agent workflow, comment style, pairing playbook
  references.md           official documentation used
.claude/skills/deslop/    strips excess comments, keeps the key ones
```

## First prompt to an agent
```
Read AGENTS.md, then docs/modules/01-setup.md. Plan the setup module: list the files you will create,
the scenario IDs it covers and the commands that will prove it works. Wait for my approval before writing code.
```
