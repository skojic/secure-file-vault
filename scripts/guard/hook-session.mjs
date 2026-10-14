#!/usr/bin/env node
// SessionStart hook. Prints the active module's handoff; Claude Code adds SessionStart stdout to
// the session's context. Never fails the session: errors print as a status line instead.
import { pathToFileURL } from 'node:url';
import { writeHandoff } from './report.mjs';
import { repoRoot, activeModule } from './lib.mjs';

export function sessionText(root) {
  const module = activeModule(root);
  if (!module) {
    return 'Guard: no plan is active (.guard/active is absent). Code edits are blocked until a person approves a plan in plans/ with scripts/guard/approve-plan.mjs.';
  }
  return writeHandoff(root, module);
}

function main() {
  try {
    console.log(sessionText(repoRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd())));
  } catch (err) {
    console.log(`Guard status unavailable: ${err.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
