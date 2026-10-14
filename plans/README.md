# Plans

Every change starts as a plan file that a person approves before code is written.
The guard scripts in `scripts/guard/` read these files; the format is strict on purpose.

## File
`plans/<module>.md`, where `<module>` matches `docs/modules/<module>.md` (for example `03-login-sessions`).
Workflow changes that have no module file use a `00-` name and `"kind": "workflow"`.

Prose first (what, why, risks), then exactly one block:

````
```json plan
{
  "module": "03-login-sessions",
  "kind": "module",
  "files": ["src/server/auth/", "src/app/(auth)/login/", "src/proxy.ts", "tests/auth/"],
  "scenarios": ["H2", "H3", "H6", "F3", "F6", "E2", "E6", "E7", "E8", "B2", "B3"],
  "rules": [5, 8, 9, 10, 12],
  "commands": ["npm run lint", "npm run typecheck", "npm test"]
}
```
````

- `files`: exact paths, or directory prefixes ending in `/`. Nothing outside this list may change.
- `scenarios`: must include every ID on the module file's "Scenarios" line. `scenarios-for.mjs` prints their entries.
- `rules`: numbers from `docs/security/rules.md`.
- `commands`: the gates `run.mjs` executes. Module plans must include lint, typecheck and test.

## Lifecycle
1. The agent writes the plan; `node scripts/guard/check-plan.mjs plans/<module>.md` must pass.
2. A person reads it and approves it in a terminal: `node scripts/guard/approve-plan.mjs plans/<module>.md`.
   This writes `plans/<module>.approved.json` (hash of the plan file, base commit) and marks the module active.
3. Any edit to the plan file voids the approval. Amend, then a person approves again.
4. Build. `node scripts/guard/run.mjs` runs the gates and records results in `.guard/` (git-ignored).
5. Done means `node scripts/guard/run.mjs --final` is green; paste its output into the PR.

Commit the plan and its stamp with the module's PR. The ledger in `.guard/` stays local.
