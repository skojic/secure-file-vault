---
name: deslop
description: Strip excessive comments from code and keep only the key ones (file purpose, exported-function docs, non-obvious reasons, security invariants). Use when the user asks to deslop, clean up, trim, strip or reduce comments, remove narration or teaching comments, or make code comments production-ready. Edits comments only, never code, and proves it with a comment-only diff check.
---

# Deslop

Removes the teaching layer and the noise from code comments. Leaves the comments a maintainer needs.
Changes comments only. If a change would touch code, it is out of scope.

This folder is self-contained. To reuse it elsewhere, copy `deslop/` into another repo's `.claude/skills/`,
or into `~/.claude/skills/` (Claude Code, all projects) or `~/.agents/skills/` (Warp, all projects).

## Input
`$ARGUMENTS` — optional paths or globs, then an optional mode word.
- No paths: files changed against `HEAD` (`git diff --name-only HEAD` plus untracked source files).
- Mode `narration` (default): remove tagged teaching comments, and only obvious noise.
- Mode `full`: also judge every untagged comment against the keep rules below.

## Step 1 — Preconditions
1. Confirm the target is in a git repository. If not, stop and ask: the diff check needs git.
2. Run `git status --porcelain -- <paths>`. If target files have uncommitted changes the user did not ask you to include, stop and ask them to commit or stash first, so the deslop diff stands alone.
3. If the repository defines its own comment tags (for example `docs/workflow/narration.md` or a "comments" section in `AGENTS.md`), read it. Its tags win over the defaults below.

## Step 2 — Classify every comment
**Always keep**
- File header that says what the file is or why it exists (1–3 lines; shorten if longer)
- Doc comments on exported or public functions, classes and types (`/** */`, Python docstrings)
- `WHY:` and `SECURITY:` tagged comments, and `TODO(owner):`
- Tool directives: `eslint-disable…`, `@ts-expect-error`, `@ts-ignore`, `prettier-ignore`, `istanbul ignore`, `webpackChunkName`, `# type:`, `# noqa`, `# pragma`, shebangs, license headers
- Untagged comments that explain something genuinely hard: a non-obvious regex, a concurrency or ordering constraint, a security reason, a protocol or RFC detail, a workaround for a library bug (with link), a deliberate performance trade-off

**Remove**
- `STEP n:` and `NARRATE:` tagged comments (the teaching layer)
- Comments that restate the code (`// loop over users`, `// return the result`)
- Commented-out code
- Section banners and dividers (`// ===== Helpers =====`) unless the file is long and they aid navigation
- Change history (`// updated to use X`, `// fixed bug`) — git holds history
- Chatty or tutorial phrasing (`// Now we…`, `// Here we…`, `// Let's…`, `// This is important!`)
- Doc comments that only repeat the signature (`@param id the id`)

**Rewrite (full mode only)**
- A long untagged block explaining a hard piece of code: reduce to one or two lines stating the reason, prefixed `WHY:`

When unsure, keep it and list it in the report.

## Step 3 — Edit
- Delete or shorten comment text only. Never change code, strings, identifiers, imports or formatting of code lines.
- For a trailing comment on a code line, remove only the comment and the whitespace before it.
- Collapse blank lines left behind so no more than one blank line remains in a row.
- Keep the file's existing comment syntax:
  - JS, TS, CSS, Go, Rust, Java, C#: `//`, `/* */`, JSX `{/* */}`
  - Python, shell, YAML, Ruby: `#` (keep docstrings; they are runtime values)
  - SQL: `--` · HTML, Markdown, XML: `<!-- -->`

## Step 4 — Prove it is comment-only
For JS, TS, CSS, Go, Rust, Java, C#, SQL (no `#` in the pattern, because `#field` is code in JS/TS):
```bash
git diff -U0 -- <paths> | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' | grep -vE '^[-+][[:space:]]*(//|/\*|\*|\*/|\{/\*|--|$)'
```
For Python, shell, YAML, Ruby:
```bash
git diff -U0 -- <paths> | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' | grep -vE '^[-+][[:space:]]*(#|$)'
```
- Empty output: every changed line was a comment or blank.
- Any output: inspect each line. Lines where only a trailing comment was removed are expected; confirm the code part is byte-identical. Anything else, revert it.

Then run the project's own checks if they exist (`lint`, `typecheck`, `test` in `package.json`, or the repo's documented commands) and quote each summary line. If none exist, say so.

## Step 5 — Report
- Files changed, comments removed, comments kept, comments rewritten (counts)
- The Step 4 command and its result, and the project checks with their summary lines
- Every comment you kept while unsure, as `path:line — reason`

## Example
Before:
```ts
export async function createSession(userId: string) {
  // NARRATE: This is where "password was correct" becomes "logged in".
  // STEP 1: 32 random bytes; base64url is cookie-safe.
  const token = randomBytes(32).toString("base64url");
  // STEP 2: Hash before storing.
  // SECURITY: never persist the raw token; the row id is its SHA-256.
  const id = createHash("sha256").update(token).digest("hex");
```
After:
```ts
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  // SECURITY: never persist the raw token; the row id is its SHA-256.
  const id = createHash("sha256").update(token).digest("hex");
```
