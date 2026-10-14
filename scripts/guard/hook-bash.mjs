#!/usr/bin/env node
// PreToolUse hook for Bash. Best-effort deterrent against an agent approving its own plan.
// It cannot parse every shell form; the real protection is review of plans/*.approved.json.
import { pathToFileURL } from 'node:url';
import { readStdinJson } from './lib.mjs';

const WRITES = /(>|\btee\b|\bcp\b|\bmv\b|\brm\b|\bsed\s+-i|\bwriteFile|\btruncate\b|\bln\b|\bperl\s+-[a-z]*i)/;

export function decideBash(command) {
  if (/approve-plan/.test(command)) return 'approve-plan.mjs is run by a person in a terminal, never by an agent.';
  if (/\.approved\.json|\.guard\/active/.test(command) && WRITES.test(command)) {
    return 'Approval stamps and .guard/active are written only by approve-plan.mjs, run by a person.';
  }
  return null;
}

async function main() {
  let input;
  try {
    input = await readStdinJson();
  } catch {
    return;
  }
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return;
  const reason = decideBash(command);
  if (reason) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
