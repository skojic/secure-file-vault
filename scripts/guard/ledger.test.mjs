// Tests for the run ledger, the handoff and the hook decisions. Run: node --test scripts/guard/
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo, planText, modulePlan } from './fixture.mjs';
import { readJsonl, appendJsonl } from './lib.mjs';
import { writeApproval } from './approve-plan.mjs';
import { runGates } from './run.mjs';
import { buildHandoff } from './report.mjs';
import { decideEdit } from './hook-edit.mjs';
import { decideBash } from './hook-bash.mjs';
import { decideStop } from './hook-stop.mjs';
import { sessionText } from './hook-session.mjs';

let repo;
let scratch;
beforeEach(() => {
  delete process.env.GUARD_MODULE;
  repo = makeRepo();
  scratch = mkdtempSync(join(tmpdir(), 'guard-scratch-'));
});
afterEach(() => {
  repo.cleanup();
  rmSync(scratch, { recursive: true, force: true });
});

// A command that counts its own runs in a file outside the repo, so counting does not change the tree.
const counter = (name, exit = 0, output = 'ok') => {
  const file = join(scratch, `${name}.count`);
  const script = join(scratch, `${name}.cjs`);
  writeFileSync(script, `require('fs').appendFileSync(${JSON.stringify(file)}, 'x');\nconsole.log(${JSON.stringify(output)});\nprocess.exit(${exit});\n`);
  return { cmd: `node '${script}'`, runs: () => (existsSync(file) ? readFileSync(file, 'utf8').length : 0) };
};

const workflowPlan = (commands, files = ['src/', 'tests/']) =>
  ({ module: '00-wf', kind: 'workflow', files, scenarios: [], rules: [], commands });

const setPlan = (plan, { approve = true } = {}) => {
  repo.write(`plans/${plan.module}.md`, planText(plan));
  if (approve) writeApproval(repo.root, plan.module, 'Tester');
};

// ---- run.mjs: cache rules ----

test('a passing command is cached until the tree changes; --final ignores the cache', () => {
  const c = counter('pass');
  setPlan(workflowPlan([c.cmd]));
  let s = runGates(repo.root, '00-wf');
  assert.equal(s.ok, true, JSON.stringify(s.gates, null, 2));
  assert.equal(c.runs(), 1);

  s = runGates(repo.root, '00-wf');
  assert.equal(c.runs(), 1, 'second run is a cache hit');
  assert.equal(s.gates[c.cmd].cached, true);

  repo.write('src/a.ts', 'changed');
  runGates(repo.root, '00-wf');
  assert.equal(c.runs(), 2, 'tree change reruns');

  s = runGates(repo.root, '00-wf', { final: true });
  assert.equal(c.runs(), 3, '--final reruns');
  assert.equal(s.final, true);
  assert.equal(s.gates[c.cmd].cached, false);
});

test('a failing command always reruns and its summary is redacted', () => {
  const c = counter('fail', 1, 'FAIL token=supersecretvalue');
  setPlan(workflowPlan([c.cmd]));
  let s = runGates(repo.root, '00-wf');
  assert.equal(s.ok, false);
  runGates(repo.root, '00-wf');
  assert.equal(c.runs(), 2, 'failure is never cached');
  s = JSON.parse(readFileSync(join(repo.root, '.guard/status/00-wf.json'), 'utf8'));
  const summary = s.gates[c.cmd].summary.join('\n');
  assert.match(summary, /token=\[redacted\]/);
  assert.doesNotMatch(summary, /supersecretvalue/);
  assert.equal(readJsonl(repo.root, 'runs', '00-wf').filter((r) => r.gate === c.cmd).length, 2);
});

test('an unapproved plan runs no commands', () => {
  const c = counter('never');
  setPlan(workflowPlan([c.cmd]), { approve: false });
  const s = runGates(repo.root, '00-wf');
  assert.equal(c.runs(), 0);
  assert.equal(s.gates[c.cmd].result, 'blocked');
  assert.equal(s.gates.approval.result, 'fail');
  assert.equal(s.ok, false);
});

test('a plan edited after approval blocks its commands', () => {
  const c = counter('void');
  setPlan(workflowPlan([c.cmd]));
  repo.write('plans/00-wf.md', planText(workflowPlan([c.cmd]), 'edited'));
  runGates(repo.root, '00-wf');
  assert.equal(c.runs(), 0);
});

test('history is trimmed to the limit', () => {
  for (let i = 0; i < 7; i++) appendJsonl(repo.root, 'runs', 'm', { i }, 5);
  assert.deepEqual(readJsonl(repo.root, 'runs', 'm').map((r) => r.i), [2, 3, 4, 5, 6]);
});

// ---- report.mjs: handoff ----

test('handoff names the next step in loop order and labels agent notes', () => {
  setPlan(modulePlan(), { approve: false });
  assert.match(buildHandoff(repo.root, '03-login'), /not approved\. A person approves it/);

  writeApproval(repo.root, '03-login', 'Tester');
  repo.write('src/server/files/policy.ts', 'x');
  assert.match(buildHandoff(repo.root, '03-login'), /1 changed file\(s\) are outside the plan/);

  repo.write('src/server/files/policy.ts', '');
  rmSync(join(repo.root, 'src/server/files'), { recursive: true });
  assert.match(buildHandoff(repo.root, '03-login'), /Tests are missing for: E2, F3/);

  appendJsonl(repo.root, 'notes', '03-login', { at: 'now', text: 'picked rollback isolation' });
  const text = buildHandoff(repo.root, '03-login');
  assert.match(text, /## Agent notes \(claims, not verified\)\n- now: picked rollback isolation/);
  assert.ok(text.length <= 4000);
});

test('handoff: green cached run asks for --final; green final run says so', () => {
  const c = counter('ok');
  setPlan(workflowPlan([c.cmd]));
  runGates(repo.root, '00-wf');
  assert.match(buildHandoff(repo.root, '00-wf'), /cached run\. Before reporting done: .*--final/);
  runGates(repo.root, '00-wf', { final: true });
  assert.match(buildHandoff(repo.root, '00-wf'), /All gates pass on a --final run/);
  repo.write('src/new.ts', 'x');
  assert.match(buildHandoff(repo.root, '00-wf'), /Files changed since the last gate run/);
});

// ---- hook-edit ----

test('edit hook: no active plan allows docs and plans, denies code', () => {
  assert.equal(decideEdit(repo.root, join(repo.root, 'docs/brief.md')).allow, true);
  assert.equal(decideEdit(repo.root, join(repo.root, 'plans/03-login.md')).allow, true);
  const d = decideEdit(repo.root, join(repo.root, 'src/server/auth/session.ts'));
  assert.equal(d.allow, false);
  assert.match(d.reason, /No approved plan is active/);
});

test('edit hook: active approved plan allows its files only', () => {
  setPlan(modulePlan());
  assert.equal(decideEdit(repo.root, join(repo.root, 'src/server/auth/session.ts')).allow, true);
  assert.equal(decideEdit(repo.root, join(repo.root, 'tests/auth/login.test.ts')).allow, true);
  const d = decideEdit(repo.root, join(repo.root, 'src/server/files/policy.ts'));
  assert.equal(d.allow, false);
  assert.match(d.reason, /not in plans\/03-login\.md/);
  assert.equal(decideEdit(repo.root, join(repo.root, 'docs/brief.md')).allow, false, 'docs need the plan once one is active');
});

test('edit hook: stamps and ledger are never editable; guard files need a workflow plan; outside repo is allowed', () => {
  setPlan(modulePlan({ files: ['src/server/auth/', 'tests/auth/'] }));
  assert.equal(decideEdit(repo.root, join(repo.root, 'plans/03-login.approved.json')).allow, false);
  assert.equal(decideEdit(repo.root, join(repo.root, '.guard/active')).allow, false);
  assert.equal(decideEdit(repo.root, join(repo.root, 'scripts/guard/lib.mjs')).allow, false);
  assert.equal(decideEdit(repo.root, '/tmp/elsewhere.txt').allow, true);

  setPlan(workflowPlan(['true'], ['scripts/guard/']));
  assert.equal(decideEdit(repo.root, join(repo.root, 'scripts/guard/lib.mjs')).allow, true);
});

test('edit hook: void approval denies', () => {
  setPlan(modulePlan());
  repo.write('plans/03-login.md', planText(modulePlan(), 'edited'));
  const d = decideEdit(repo.root, join(repo.root, 'src/server/auth/session.ts'));
  assert.equal(d.allow, false);
  assert.match(d.reason, /void/);
});

// ---- hook-bash ----

test('bash hook: denies approve-plan and writes to stamps, allows reads and normal commands', () => {
  assert.ok(decideBash('node scripts/guard/approve-plan.mjs plans/03-login.md'));
  assert.ok(decideBash('echo {} > plans/03-login.approved.json'));
  assert.ok(decideBash('echo 03-login | tee .guard/active'));
  assert.equal(decideBash('cat plans/03-login.approved.json'), null);
  assert.equal(decideBash('npm test'), null);
});

// ---- hook-stop ----

test('stop hook: unplanned code change blocks once, then an unchanged tree does not block', () => {
  assert.equal(decideStop(repo.root).block, false, 'clean tree');
  repo.write('src/sneaky.ts', 'x');
  const d = decideStop(repo.root);
  assert.equal(d.block, true);
  assert.match(d.reason, /no approved plan active: src\/sneaky\.ts/);
  assert.equal(decideStop(repo.root).block, false, 'same tree: no loop');
  repo.write('docs/brief.md', 'doc-only change');
  assert.equal(decideStop(repo.root).block, true, 'tree changed and the unplanned file is still there');
});

test('stop hook: failing gates block with the failing command in the reason; passing gates do not', () => {
  const bad = counter('bad', 1, 'assertion failed in tests/auth/login.test.ts:12');
  setPlan(workflowPlan([bad.cmd]));
  repo.write('src/a.ts', 'x');
  const d = decideStop(repo.root);
  assert.equal(d.block, true);
  assert.match(d.reason, /RESULT: FAIL/);
  assert.match(d.reason, /login\.test\.ts:12/);

  const good = counter('good');
  setPlan(workflowPlan([good.cmd]));
  repo.write('src/a.ts', 'y');
  assert.equal(decideStop(repo.root).block, false);
});

// ---- hook-session ----

test('session hook: states that no plan is active, or prints the handoff', () => {
  assert.match(sessionText(repo.root), /no plan is active/);
  setPlan(modulePlan());
  assert.match(sessionText(repo.root), /# Guard handoff: 03-login/);
  assert.ok(existsSync(join(repo.root, '.guard/handoff/03-login.md')));
});
