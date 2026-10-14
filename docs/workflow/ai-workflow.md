# AI workflow

How to build this app with a coding agent (Claude Code CLI or Desktop, Warp, Codex, Cursor) without losing control of it.

## The loop, per module
1. **Plan** — the agent reads `AGENTS.md` and one module file, then writes `plans/<module>.md` ([format](../../plans/README.md)). No code yet
2. **Approve** — you check the plan against `docs/security/rules.md` and the scenario IDs, then run `approve-plan` in a terminal
3. **Build** — smallest vertical slice first: schema → service → route → UI
4. **Verify** — `node scripts/guard/run.mjs` runs the plan's commands and records the result; done is a green `--final`
5. **Review** — you read the diff with the checklist below
6. **Narrate** — comments per [narration.md](narration.md); later `/deslop` if needed

## Gates
Each check is a script that exits 0 or 1. The scripts hold the logic; Claude Code hooks only call them, and CI
runs the same scripts without the cache. Other agents (Codex, Cursor, Warp) get no hooks, so they run the
scripts directly and CI catches the rest.

| Phase | Gate | Script | Hook | CI |
|---|---|---|---|---|
| Plan | Plan block valid; files in allowed roots; scenario IDs and rule numbers exist; module scenarios all listed | `check-plan.mjs` | — | ✓ |
| Approve | A person approves in a terminal; the stamp holds the plan's hash, so any edit voids it | `approve-plan.mjs` | Bash: agent may not run it | stamp reviewed |
| Build | Edits only to files in the approved plan; stamps, ledger and guard files are off limits | — | PreToolUse `Write\|Edit` | — |
| Build | Every changed path, from any tool, is in the plan | `check-scope.mjs` | Stop | ✓ |
| Verify | Every module scenario ID has a test named after it | `check-scenarios.mjs` | Stop | ✓ |
| Verify | The plan's commands pass (lint, typecheck, test) | `run.mjs` | Stop (cached) | `--final` |

**Ledger.** `run.mjs` writes `.guard/` (git-ignored): latest result per gate, a trimmed history, and
`.guard/handoff/<module>.md`, generated from git and the ledger only. A passing command is skipped when the
files it ran against are unchanged; a failure always reruns; `--final` reruns everything. Stored output is the
last 20 lines, redacted (rule 5).

**New session.** Claude Code prints the handoff at session start. Other agents read
`.guard/handoff/<module>.md` first. Agent notes (`note.mjs`) appear there under "claims, not verified".

**Threat model.** The gates catch drift and mistakes, not an agent working around them on purpose: a shell
can fake a terminal and a stamp is a file. Your review of `plans/*.approved.json`, `scripts/guard/` and
`.claude/` in every PR is the real gate. If a guard bug blocks you, disable hooks with `/hooks` (you, not the agent).

## Prompts
Plan:
```
Read AGENTS.md and docs/modules/03-login-sessions.md, and run node scripts/guard/scenarios-for.mjs
03-login-sessions for the scenario entries. Write plans/03-login-sessions.md per plans/README.md: files,
scenario IDs, rules, commands, and the tests you will write first. Check every library API you plan to use
against node_modules or the versioned docs and list any you could not confirm. Run check-plan on it.
Do not write code yet.
```
Build:
```
Implement the approved plan. Write the tests listed in "Done when" first and show them failing.
Then implement until they pass. Comment the code per docs/workflow/narration.md.
```
Verify:
```
Run node scripts/guard/run.mjs --final and paste its output. If any gate fails, fix it and run it again.
Do not report done on the strength of having written the code.
```
Review:
```
Review this diff against docs/security/rules.md. For each rule that applies, say where the code satisfies it
or where it does not. check-scenarios lists missing tests; say which tests could pass without proving the rule.
```

## Review checklist for agent output
- Does every route call `getCurrentUser()` and a policy, or a service that does?
- Is any list query filtered in JavaScript instead of SQL?
- Does any error path return 403 or 500 for a file the user cannot see?
- Is a password, token, cookie or body logged anywhere?
- Does every library call exist in the **installed** version? (The agent must say how it checked.)
- Did the diff touch files outside the plan?
- Do the tests fail when the rule is broken? Break it once and see

## Failure modes of agent-assisted work, and the counter
- **Plausible API that does not exist** → require the agent to cite `node_modules` path or a versioned doc URL
- **Training-data Next.js** (e.g. `middleware.ts`, sync `cookies()`) → read `node_modules/next/dist/docs/` first; Next.js 16 renamed Middleware to Proxy
- **Scope creep** → one module per session; `check-scope` fails on any path outside the approved plan
- **"Tests pass" without a run** → the Stop hook runs the gates itself; done is a green `run.mjs --final`
- **Lost state between sessions** → the handoff in `.guard/handoff/` says what passes, what fails, what is next
- **Silent default change** → decisions change only through `docs/decisions/`
- **Context drift in long sessions** → start a fresh session per module; AGENTS.md reloads

## Keeping the docs true
When the code and a doc disagree, fix one of them in the same PR. A doc nobody updates becomes a trap for the next agent.
