# AI workflow

How to build this app with a coding agent (Claude Code CLI or Desktop, Warp, Codex, Cursor) without losing control of it.

## The loop, per module
1. **Plan** — the agent reads `AGENTS.md` and one module file, then proposes. No code yet
2. **Approve** — you check the plan against `docs/security/rules.md` and the scenario IDs
3. **Build** — smallest vertical slice first: schema → service → route → UI
4. **Verify** — lint, typecheck, tests; the agent quotes the output
5. **Review** — you read the diff with the checklist below
6. **Narrate** — comments per [narration.md](narration.md); later `/deslop` if needed

## Prompts
Plan:
```
Read AGENTS.md and docs/modules/03-login-sessions.md. Propose a plan: files to create, scenario IDs covered,
tests you will write first, and the commands that prove it works. Check every library API you plan to use
against node_modules or the versioned docs and list any you could not confirm. Do not write code yet.
```
Build:
```
Implement the approved plan. Write the tests listed in "Done when" first and show them failing.
Then implement until they pass. Comment the code per docs/workflow/narration.md.
```
Verify:
```
Run npm run lint, npm run typecheck and npm test. Paste the summary line of each. If anything fails, fix it
and run all three again. Do not report done on the strength of having written the code.
```
Review:
```
Review this diff against docs/security/rules.md. For each rule that applies, say where the code satisfies it
or where it does not. List any scenario ID from the module file that has no test.
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
- **Plausible API that does not exist** → require the agent to cite a `node_modules` path or a versioned doc URL
- **Training-data Next.js** (e.g. `middleware.ts`, sync `cookies()`) → read `node_modules/next/dist/docs/` first; Next.js 16 renamed Middleware to Proxy
- **Scope creep** → one module per session; reject diffs outside the plan
- **"Tests pass" without a run** → no output quoted means not done
- **Silent default change** → decisions change only through `docs/decisions/`
- **Context drift in long sessions** → start a fresh session per module; AGENTS.md reloads

## Keeping the docs true
When the code and a doc disagree, fix one of them in the same PR. A doc nobody updates becomes a trap for the next agent.
