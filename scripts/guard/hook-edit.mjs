#!/usr/bin/env node
// PreToolUse hook for Write|Edit|MultiEdit|NotebookEdit. Denies edits outside the approved active
// plan. Fails closed: any internal error denies the edit with the error as the reason.
// Shell writes bypass this hook; check-scope.mjs (Stop hook and CI) catches those from git.
import { pathToFileURL } from 'node:url';
import { FREE_WITHOUT_PLAN } from './config.mjs';
import {
  repoRoot, toRepoPath, isNeverEdit, isProtected, matchesAny, activeModule, approval, readPlan,
  planPath, readStdinJson,
} from './lib.mjs';

export function decideEdit(root, path) {
  const rel = toRepoPath(root, path);
  if (rel === null) return { allow: true };
  if (isNeverEdit(rel)) return { allow: false, reason: `${rel} is written only by the guard scripts (approve-plan.mjs, run.mjs).` };

  const module = activeModule(root);
  if (!module) {
    if (matchesAny(rel, FREE_WITHOUT_PLAN)) return { allow: true };
    return { allow: false, reason: `No approved plan is active, so ${rel} cannot be edited. Write plans/<module>.md (format in plans/README.md) and ask a person to approve it with scripts/guard/approve-plan.mjs.` };
  }
  if (rel.startsWith('plans/')) return { allow: true };

  const appr = approval(root, module);
  if (appr.state !== 'valid') {
    return { allow: false, reason: `The active plan ${planPath(module)} is ${appr.state === 'missing' ? 'not approved' : `void (${appr.reason})`}. A person approves it with scripts/guard/approve-plan.mjs.` };
  }
  const { plan } = readPlan(root, module);
  if (isProtected(rel) && plan.kind !== 'workflow') {
    return { allow: false, reason: `${rel} is a guard file. Only an approved "workflow" plan that lists it may change it.` };
  }
  if (matchesAny(rel, plan.files)) return { allow: true };
  return { allow: false, reason: `${rel} is not in ${planPath(module)}. Amend the plan's "files" and ask a person to re-approve it, or edit a planned file instead.` };
}

async function main() {
  let decision;
  try {
    const input = await readStdinJson();
    const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (typeof path !== 'string') return;
    const root = repoRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
    decision = decideEdit(root, path);
  } catch (err) {
    decision = { allow: false, reason: `Guard edit hook failed, so the edit is denied: ${err.message}` };
  }
  if (!decision.allow) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: decision.reason },
    }));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
