#!/usr/bin/env node
// Fails when the working tree changed a path the approved plan does not list.
// Reads git, so it catches writes from any tool (editor tools, shell redirects, scripts).
// Usage: node scripts/guard/check-scope.mjs [<module>]   (default: the active module)
import { pathToFileURL } from 'node:url';
import { GENERATED } from './config.mjs';
import { cli, repoRoot, readPlan, approval, activeModule, changedPaths, matchesAny, git, GuardError } from './lib.mjs';

export function checkScope(root, module) {
  const appr = approval(root, module);
  if (appr.state !== 'valid') {
    return { ok: false, reason: appr.state === 'missing' ? 'plan is not approved' : `approval void: ${appr.reason}`, inside: [], outside: [], exempt: [] };
  }
  const { base } = appr.stamp;
  try {
    git(root, ['cat-file', '-e', `${base}^{commit}`]);
  } catch {
    throw new GuardError(`approval base ${base} is not a commit in this repository`);
  }
  const { plan } = readPlan(root, module);
  const inside = [];
  const outside = [];
  const exempt = [];
  for (const rel of changedPaths(root, base)) {
    if (rel.startsWith('plans/') || matchesAny(rel, GENERATED)) exempt.push(rel);
    else if (matchesAny(rel, plan.files)) inside.push(rel);
    else outside.push(rel);
  }
  return { ok: outside.length === 0, reason: outside.length ? `${outside.length} file(s) outside the plan` : null, base, inside, outside, exempt };
}

async function main() {
  const root = repoRoot();
  const module = process.argv[2] ?? activeModule(root);
  if (!module) throw new GuardError('no module given and no active plan (.guard/active)');
  const r = checkScope(root, module);
  for (const f of r.outside) console.log(`outside plan: ${f}`);
  console.log(r.ok ? `PASS scope ${module}: ${r.inside.length} in plan, ${r.exempt.length} exempt` : `FAIL scope ${module}: ${r.reason}`);
  return r.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) cli(main);
