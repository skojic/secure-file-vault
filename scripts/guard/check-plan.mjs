#!/usr/bin/env node
// Validates plans/<module>.md before a human approves it.
// Usage: node scripts/guard/check-plan.mjs plans/03-login-sessions.md
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REQUIRED_MODULE_COMMANDS } from './config.mjs';
import {
  cli, repoRoot, readPlan, scenarioEntries, ruleNumbers, moduleScenarios, moduleDocPath,
  moduleFromPlanPath, isAllowedRoot, isProtected, isNeverEdit, GuardError,
} from './lib.mjs';

export function checkPlan(root, module) {
  const { plan, rel } = readPlan(root, module);
  const errors = [];
  const warnings = [];
  const isList = (v) => Array.isArray(v);

  if (plan.module !== module) errors.push(`"module" is ${JSON.stringify(plan.module)}, expected "${module}" (the file name)`);
  if (!['module', 'workflow'].includes(plan.kind)) errors.push('"kind" must be "module" or "workflow"');

  if (!isList(plan.files) || plan.files.length === 0) errors.push('"files" must be a non-empty list');
  for (const f of isList(plan.files) ? plan.files : []) {
    if (typeof f !== 'string' || f.startsWith('/') || f.includes('..')) { errors.push(`bad file entry ${JSON.stringify(f)}`); continue; }
    if (isNeverEdit(f)) errors.push(`${f}: approval stamps and the ledger are written by scripts only`);
    else if (isProtected(f)) {
      if (plan.kind === 'workflow') warnings.push(`${f}: touches guard files (protected); approve only if intended`);
      else errors.push(`${f}: guard files are protected; only a "workflow" plan may list them`);
    } else if (!isAllowedRoot(f)) errors.push(`${f}: outside the allowed roots in scripts/guard/config.mjs`);
  }

  const known = scenarioEntries(root);
  if (!isList(plan.scenarios)) errors.push('"scenarios" must be a list');
  for (const id of isList(plan.scenarios) ? plan.scenarios : []) {
    if (!known.has(id)) errors.push(`unknown scenario ID ${JSON.stringify(id)}`);
  }

  const rules = ruleNumbers(root);
  if (!isList(plan.rules)) errors.push('"rules" must be a list');
  for (const n of isList(plan.rules) ? plan.rules : []) {
    if (!rules.has(n)) errors.push(`unknown rule ${JSON.stringify(n)} (docs/security/rules.md)`);
  }

  if (!isList(plan.commands) || plan.commands.length === 0) errors.push('"commands" must be a non-empty list');

  if (plan.kind === 'module') {
    if (!existsSync(join(root, moduleDocPath(module)))) {
      errors.push(`kind "module" needs ${moduleDocPath(module)}`);
    } else {
      const planned = new Set(isList(plan.scenarios) ? plan.scenarios : []);
      const missing = moduleScenarios(root, module).filter((id) => !planned.has(id));
      if (missing.length) errors.push(`scenarios listed in ${moduleDocPath(module)} but not in the plan: ${missing.join(', ')}`);
    }
    for (const cmd of REQUIRED_MODULE_COMMANDS) {
      if (!(plan.commands ?? []).includes(cmd)) errors.push(`module plans must run "${cmd}"`);
    }
  }

  return { rel, plan, errors, warnings };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new GuardError('usage: check-plan.mjs plans/<module>.md');
  const root = repoRoot();
  const { rel, errors, warnings } = checkPlan(root, moduleFromPlanPath(arg));
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.log(`error: ${e}`);
  console.log(errors.length ? `FAIL ${rel}: ${errors.length} error(s)` : `PASS ${rel}`);
  return errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) cli(main);
