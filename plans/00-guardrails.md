# 00 · Guardrails: deterministic gates and a run ledger

## What and why
The checks in `docs/workflow/ai-workflow.md` were prompts: the agent was asked to quote output, stay in scope
and list untested scenario IDs. This plan turns each check into a script that exits 0 or 1, records every run
in a local ledger (`.guard/`) so reruns skip unchanged gates and a new session starts from a generated handoff,
and wires Claude Code hooks as thin wrappers around the scripts.

Authority: scripts hold the logic; hooks and the ledger are fast feedback and memory; uncached CI plus code-owner
review decides. There is no git remote yet, so until module 06 the authority is a `--final` run started by a person
plus their diff review.

## Threat model
The gates catch drift and mistakes: scope creep, unverified "done", missing tests, lost state between sessions.
They do not stop an agent that deliberately works around them (a shell can fake a terminal, a stamp is a file).
That is the job of human review and, after module 06, CODEOWNERS on `plans/*.approved.json`, `scripts/guard/`
and `.claude/`.

## Known limits
- `check-scenarios` proves a test is named after a scenario, not that it asserts the right thing.
  The policy mutation check arrives with module 05.
- The edit hook does not see shell writes; `check-scope` catches them from git at Stop and in CI.
- Ledger summaries are redacted (rule 5), but a novel secret format could pass the patterns.

## Change from the approved draft
The draft named `node --test scripts/guard/` as the test command. Node 24 rejects a directory argument
(`Cannot find module '.../scripts/guard'`); the command is the glob below.

## Amendment 1
- `README.md`: rewritten to describe the repository and the guard mechanisms.
- `scripts/guard/run.mjs`: a cached gate no longer prints the original run's duration, which read as a fresh run.

```json plan
{
  "module": "00-guardrails",
  "kind": "workflow",
  "files": [
    "scripts/guard/",
    ".claude/settings.json",
    ".gitignore",
    "AGENTS.md",
    "README.md",
    "docs/workflow/ai-workflow.md",
    "docs/modules/01-setup.md",
    "docs/modules/06-collaboration.md"
  ],
  "scenarios": [],
  "rules": [5],
  "commands": ["node --test 'scripts/guard/*.test.mjs'"]
}
```
