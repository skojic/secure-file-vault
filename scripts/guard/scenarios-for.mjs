#!/usr/bin/env node
// Prints only the scenario entries a module names, so a session loads those instead of all four files.
// Usage: node scripts/guard/scenarios-for.mjs 03-login-sessions
import { pathToFileURL } from 'node:url';
import { cli, repoRoot, scenarioEntries, moduleScenarios, GuardError } from './lib.mjs';

export function scenariosFor(root, module) {
  const entries = scenarioEntries(root);
  return moduleScenarios(root, module).map((id) => {
    if (!entries.has(id)) throw new GuardError(`docs/modules/${module}.md names ${id}, which no scenario file defines`);
    return entries.get(id);
  });
}

async function main() {
  const module = process.argv[2];
  if (!module) throw new GuardError('usage: scenarios-for.mjs <module>');
  console.log(scenariosFor(repoRoot(), module).join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) cli(main);
