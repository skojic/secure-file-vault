#!/usr/bin/env node
// Human approval of a plan. Writes plans/<module>.approved.json (hash of the plan file + base commit)
// and marks the module active in .guard/active. Needs an interactive terminal and a typed
// confirmation, so an agent's non-interactive shell cannot run it by accident.
// Usage (a person, in a terminal): node scripts/guard/approve-plan.mjs plans/03-login-sessions.md
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { checkPlan } from './check-plan.mjs';
import { cli, repoRoot, readPlan, moduleFromPlanPath, stampPath, git, writeLedgerFile, GuardError } from './lib.mjs';

export function writeApproval(root, module, approvedBy) {
  const { hash } = readPlan(root, module);
  const stamp = {
    module,
    sha256: hash,
    base: git(root, ['rev-parse', 'HEAD']).trim(),
    approved_at: new Date().toISOString(),
    approved_by: approvedBy,
  };
  writeFileSync(join(root, stampPath(module)), `${JSON.stringify(stamp, null, 2)}\n`);
  writeLedgerFile(root, 'active', `${module}\n`);
  return stamp;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new GuardError('usage: approve-plan.mjs plans/<module>.md');
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new GuardError('approve-plan must be run by a person in an interactive terminal');
  }
  const root = repoRoot();
  const module = moduleFromPlanPath(arg);
  const { plan, errors, warnings } = checkPlan(root, module);
  if (errors.length) {
    for (const e of errors) console.log(`error: ${e}`);
    throw new GuardError('the plan has errors; fix them before approving');
  }
  console.log(`Plan ${module} (${plan.kind})`);
  console.log(`  files:     ${plan.files.join(', ')}`);
  console.log(`  scenarios: ${plan.scenarios.join(', ') || '(none)'}`);
  console.log(`  rules:     ${plan.rules.join(', ') || '(none)'}`);
  console.log(`  commands:  ${plan.commands.join(' · ')}`);
  for (const w of warnings) console.log(`  WARNING: ${w}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Type "${module}" to approve: `)).trim();
  rl.close();
  if (answer !== module) throw new GuardError('not approved (confirmation did not match)');

  const name = git(root, ['config', 'user.name']).trim() || 'unknown';
  const stamp = writeApproval(root, module, name);
  console.log(`Approved ${module} at base ${stamp.base.slice(0, 7)}. Active module: ${module}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) cli(main);
