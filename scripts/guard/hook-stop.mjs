#!/usr/bin/env node
// Stop hook. Runs the gates when the tree changed since the last check and blocks the stop with
// the failing gates as the reason. An unchanged tree never blocks, so Q&A turns cost nothing and a
// failure the agent cannot fix does not loop (the 8-continuation cap is the backstop).
import { pathToFileURL } from 'node:url';
import { FREE_WITHOUT_PLAN } from './config.mjs';
import { runGates, formatRun } from './run.mjs';
import {
  repoRoot, treeHash, activeModule, changedPaths, matchesAny, readLedgerFile, writeLedgerFile, readStdinJson,
} from './lib.mjs';

const MAX_REASON = 3000;

export function decideStop(root) {
  const tree = treeHash(root);
  const prev = JSON.parse(readLedgerFile(root, 'stop-state.json') ?? '{}');
  if (prev.tree === tree) return { block: false };
  writeLedgerFile(root, 'stop-state.json', `${JSON.stringify({ tree, at: new Date().toISOString() })}\n`);

  const module = activeModule(root);
  if (!module) {
    const unplanned = changedPaths(root, 'HEAD').filter((p) => !matchesAny(p, FREE_WITHOUT_PLAN));
    if (!unplanned.length) return { block: false };
    return { block: true, reason: `Files changed with no approved plan active: ${unplanned.slice(0, 10).join(', ')}${unplanned.length > 10 ? ' …' : ''}. Revert them, or write plans/<module>.md and ask a person to approve it.` };
  }

  const status = runGates(root, module);
  if (status.ok) return { block: false };
  const reason = `Guard gates failed.\n${formatRun(status)}\nFull state: .guard/handoff/${module}.md`;
  return { block: true, reason: reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON)}\n[truncated]` : reason };
}

async function main() {
  let input = {};
  let decision;
  try {
    input = await readStdinJson();
    decision = decideStop(repoRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()));
  } catch (err) {
    decision = input.stop_hook_active ? { block: false } : { block: true, reason: `Guard stop hook failed: ${err.message}` };
  }
  if (decision.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: decision.reason }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
