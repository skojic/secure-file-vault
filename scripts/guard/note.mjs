#!/usr/bin/env node
// Appends an agent note to the active module's handoff. Notes are rendered under
// "Agent notes (claims, not verified)" and are redacted like every other ledger line.
// Usage: node scripts/guard/note.mjs "chose transaction rollback for test isolation"
import { pathToFileURL } from 'node:url';
import { writeHandoff } from './report.mjs';
import { cli, repoRoot, activeModule, appendJsonl, redact, GuardError } from './lib.mjs';

async function main() {
  const text = process.argv.slice(2).join(' ').trim();
  if (!text) throw new GuardError('usage: note.mjs "<text>"');
  const root = repoRoot();
  const module = process.env.GUARD_MODULE ?? activeModule(root);
  if (!module) throw new GuardError('no active plan (.guard/active)');
  appendJsonl(root, 'notes', module, { at: new Date().toISOString(), text: redact(text).slice(0, 300) }, 50);
  writeHandoff(root, module);
  console.log(`noted for ${module}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) cli(main);
