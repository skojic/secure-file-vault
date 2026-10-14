#!/usr/bin/env node
// Single entry point for the gates. Records every result in the ledger (.guard/) and regenerates
// the handoff. Commands from the approved plan are cached: a command is skipped only when its last
// result was a pass and the tree hash it ran against is unchanged. A failure always reruns.
// --final ignores the cache and prints a block for the PR description. "Done" means a green --final.
// Usage: node scripts/guard/run.mjs [<module>] [--final]
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkPlan } from './check-plan.mjs';
import { checkScope } from './check-scope.mjs';
import { checkScenarios } from './check-scenarios.mjs';
import { writeHandoff } from './report.mjs';
import {
  cli, repoRoot, activeModule, approval, readPlan, treeHash, sha256, summarize, readStatus,
  writeStatus, appendJsonl, git, GuardError,
} from './lib.mjs';

function timed(fn) {
  const start = Date.now();
  const out = fn();
  return { ...out, duration_ms: Date.now() - start };
}

export function runGates(root, module, { final = false, now = () => new Date().toISOString() } = {}) {
  const previous = readStatus(root, module);
  const tree = treeHash(root);
  const gates = {};
  const record = (name, result) => {
    gates[name] = { result: result.result, command: result.command ?? null, input_hash: result.input_hash ?? null,
      ran_at: result.cached ? result.ran_at : now(), duration_ms: result.duration_ms ?? 0, cached: Boolean(result.cached), summary: result.summary ?? [] };
    if (!result.cached) appendJsonl(root, 'runs', module, { module, gate: name, ...gates[name] });
  };

  record('plan', timed(() => {
    const r = checkPlan(root, module);
    return { result: r.errors.length ? 'fail' : 'pass', summary: [...r.errors.map((e) => `error: ${e}`), ...r.warnings.map((w) => `warning: ${w}`)] };
  }));

  const appr = approval(root, module);
  record('approval', { result: appr.state === 'valid' ? 'pass' : 'fail',
    summary: [appr.state === 'valid' ? `approved ${appr.stamp.approved_at} at base ${appr.stamp.base.slice(0, 7)}` : appr.state === 'missing' ? 'plan is not approved' : `void: ${appr.reason}`] });

  if (appr.state === 'valid') {
    record('scope', timed(() => {
      const r = checkScope(root, module);
      return { result: r.ok ? 'pass' : 'fail', summary: r.ok ? [`${r.inside.length} in plan, ${r.exempt.length} exempt`] : r.outside.map((f) => `outside plan: ${f}`) };
    }));
  } else {
    record('scope', { result: 'blocked', summary: ['not checked: plan is not approved'] });
  }

  record('scenarios', timed(() => {
    const r = checkScenarios(root, module);
    if (!r.applicable) return { result: 'n/a', summary: ['the plan lists no scenario IDs'] };
    return { result: r.ok ? 'pass' : 'fail', summary: r.ok ? [`${r.covered.length}/${r.required.length} covered`] : [`missing tests: ${r.missing.join(', ')}`] };
  }));

  // Commands run only from an approved plan: an unapproved plan must not be able to run anything.
  const { plan } = readPlan(root, module);
  for (const command of plan.commands ?? []) {
    if (appr.state !== 'valid') {
      record(command, { result: 'blocked', command, summary: ['not run: plan is not approved'] });
      continue;
    }
    const input_hash = sha256(`${tree}\0${process.version}\0${command}`);
    const last = previous.gates?.[command];
    if (!final && last?.result === 'pass' && last.input_hash === input_hash) {
      record(command, { ...last, cached: true });
      continue;
    }
    record(command, timed(() => {
      const p = spawnSync('sh', ['-c', command], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const output = `${p.stdout ?? ''}\n${p.stderr ?? ''}${p.error ? `\n${p.error.message}` : ''}`;
      return { result: p.status === 0 ? 'pass' : 'fail', command, input_hash, summary: summarize(output) };
    }));
  }

  const ok = Object.values(gates).every((g) => g.result === 'pass' || g.result === 'n/a');
  const status = { module, updated_at: now(), final, ok, tree_hash: tree, head: git(root, ['rev-parse', '--short', 'HEAD']).trim(), gates };
  writeStatus(root, module, status);
  writeHandoff(root, module);
  return status;
}

export function formatRun(status) {
  const lines = [`Guard ${status.final ? 'final run' : 'run'}: ${status.module} @ ${status.head} (${status.updated_at})`];
  for (const [name, g] of Object.entries(status.gates)) {
    lines.push(`${g.result.toUpperCase().padEnd(7)} ${name}${g.cached ? ` (cached from ${g.ran_at})` : g.duration_ms ? ` ${g.duration_ms}ms` : ''}`);
    if (g.result === 'fail') for (const s of g.summary.slice(-8)) lines.push(`        ${s}`);
  }
  lines.push(status.ok ? 'RESULT: all gates pass' : 'RESULT: FAIL');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const final = args.includes('--final');
  const root = repoRoot();
  const module = args.find((a) => !a.startsWith('--')) ?? activeModule(root);
  if (!module) throw new GuardError('no module given and no active plan (.guard/active)');
  const status = runGates(root, module, { final });
  console.log(formatRun(status));
  return status.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) cli(main);
