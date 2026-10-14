#!/usr/bin/env node
// Fails when a scenario ID the module must cover has no test named after it.
// A test counts only as it("ID: ...") or test("ID: ..."), optionally .only/.concurrent/.sequential.
// .skip and .todo do not count. This proves a test is named, not that it asserts the right thing.
// Usage: node scripts/guard/check-scenarios.mjs [<module>]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, repoRoot, readPlan, planPath, moduleScenarios, activeModule, walk, GuardError } from './lib.mjs';

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_NAME = /\b(?:it|test)(?:\.(?:only|concurrent|sequential))*\(\s*["'`]([HFEB]\d+):/g;

// From the plan when one exists; before that, from the module file alone.
export function requiredScenarios(root, module) {
  if (!existsSync(join(root, planPath(module)))) return moduleScenarios(root, module).sort();
  const { plan } = readPlan(root, module);
  const ids = new Set(plan.scenarios ?? []);
  if (plan.kind === 'module') for (const id of moduleScenarios(root, module)) ids.add(id);
  return [...ids].sort();
}

export function testedScenarios(root) {
  const found = new Map();
  for (const rel of walk(root, 'tests', (p) => TEST_FILE.test(p))) {
    for (const m of readFileSync(join(root, rel), 'utf8').matchAll(TEST_NAME)) {
      if (!found.has(m[1])) found.set(m[1], rel);
    }
  }
  return found;
}

export function checkScenarios(root, module) {
  const required = requiredScenarios(root, module);
  const tested = testedScenarios(root);
  const covered = required.filter((id) => tested.has(id));
  const missing = required.filter((id) => !tested.has(id));
  return { applicable: required.length > 0, required, covered, missing, ok: missing.length === 0 };
}

async function main() {
  const root = repoRoot();
  const module = process.argv[2] ?? activeModule(root);
  if (!module) throw new GuardError('no module given and no active plan (.guard/active)');
  const r = checkScenarios(root, module);
  if (!r.applicable) {
    console.log(`N/A scenarios ${module}: the plan lists no scenario IDs`);
    return 0;
  }
  if (r.missing.length) console.log(`missing tests: ${r.missing.join(', ')}`);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} scenarios ${module}: ${r.covered.length}/${r.required.length} covered`);
  return r.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) cli(main);
