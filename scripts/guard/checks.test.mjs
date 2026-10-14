// Tests for the parsers and the three checks. Run: node --test scripts/guard/
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, planText, modulePlan } from './fixture.mjs';
import { scenarioEntries, ruleNumbers, moduleScenarios, readPlan, approval, redact, summarize, treeHash, GuardError } from './lib.mjs';
import { checkPlan } from './check-plan.mjs';
import { checkScope } from './check-scope.mjs';
import { checkScenarios } from './check-scenarios.mjs';
import { scenariosFor } from './scenarios-for.mjs';
import { writeApproval } from './approve-plan.mjs';

let repo;
beforeEach(() => {
  delete process.env.GUARD_MODULE;
  repo = makeRepo();
});
afterEach(() => repo.cleanup());

const approve = (plan = modulePlan()) => {
  repo.write(`plans/${plan.module}.md`, planText(plan));
  return writeApproval(repo.root, plan.module, 'Tester');
};

// ---- Parsers ----

test('scenario entries parse with their indented lines; README is skipped', () => {
  const entries = scenarioEntries(repo.root);
  assert.deepEqual([...entries.keys()].sort(), ['E1', 'E2', 'F3']);
  assert.match(entries.get('E2'), /dummy verify/);
});

test('fail closed: reformatted scenario files parse to an error, not an empty pass', () => {
  repo.write('docs/scenarios/edge-cases.md', '## E1 Username lookalikes\n');
  repo.write('docs/scenarios/failures.md', '## F3 Database down\n');
  assert.throws(() => scenarioEntries(repo.root), (e) => e instanceof GuardError && /zero scenario IDs/.test(e.message));
});

test('duplicate scenario ID is an error', () => {
  repo.write('docs/scenarios/failures.md', '- **E1. Again** — dup\n');
  assert.throws(() => scenarioEntries(repo.root), /duplicate scenario ID E1/);
});

test('fail closed: rules and module scenarios', () => {
  assert.deepEqual([...ruleNumbers(repo.root)], [1, 2, 5]);
  assert.deepEqual(moduleScenarios(repo.root, '03-login'), ['E2', 'F3']);
  repo.write('docs/security/rules.md', '# Rules\n- one\n');
  assert.throws(() => ruleNumbers(repo.root), /zero rules/);
  repo.write('docs/modules/03-login.md', '# 03\n## Scenarios\nnone yet\n');
  assert.throws(() => moduleScenarios(repo.root, '03-login'), /zero scenario IDs/);
});

test('a plan needs exactly one json plan block', () => {
  repo.write('plans/03-login.md', '# Plan\nno block\n');
  assert.throws(() => readPlan(repo.root, '03-login'), /exactly one/);
  repo.write('plans/03-login.md', '```json plan\n{ nope }\n```\n');
  assert.throws(() => readPlan(repo.root, '03-login'), /not valid JSON/);
});

test('scenarios-for prints only the module entries', () => {
  const out = scenariosFor(repo.root, '03-login').join('\n');
  assert.match(out, /E2\. Login timing/);
  assert.match(out, /F3\. Database down/);
  assert.doesNotMatch(out, /E1\./);
});

// ---- Redaction (rule 5) ----

test('redaction removes tokens, cookies, bearer values and long opaque strings', () => {
  const token = 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5';
  const lines = [
    `session token=${token}`,
    'Cookie: sid=abc123',
    'Authorization: Bearer abc.def.ghi',
    `password: "hunter2"`,
    `raw ${token} end`,
  ].map(redact);
  for (const l of lines) {
    assert.doesNotMatch(l, /Zm9vYmFy|abc123|abc\.def|hunter2/, l);
  }
  assert.equal(redact('tests/auth/login.test.ts:42 passed'), 'tests/auth/login.test.ts:42 passed');
});

test('summarize keeps the last N non-empty redacted lines', () => {
  const out = summarize(['a', '', 'b', 'secret=xyz', 'c'].join('\n'), 3);
  assert.deepEqual(out, ['b', 'secret=[redacted]', 'c']);
});

test('tree hash changes on edit and ignores git-ignored files', () => {
  const before = treeHash(repo.root);
  repo.write('.guard/status/x.json', '{}');
  assert.equal(treeHash(repo.root), before);
  repo.write('src/a.ts', 'x');
  assert.notEqual(treeHash(repo.root), before);
});

// ---- check-plan ----

test('a valid module plan passes', () => {
  repo.write('plans/03-login.md', planText(modulePlan()));
  assert.deepEqual(checkPlan(repo.root, '03-login').errors, []);
});

test('check-plan rejects unknown IDs, unknown rules, missing module scenarios and missing commands', () => {
  repo.write('plans/03-login.md', planText(modulePlan({ scenarios: ['E2', 'E42'], rules: [1, 9], commands: ['npm test'] })));
  const { errors } = checkPlan(repo.root, '03-login');
  const all = errors.join('\n');
  assert.match(all, /unknown scenario ID "E42"/);
  assert.match(all, /unknown rule 9/);
  assert.match(all, /not in the plan: F3/);
  assert.match(all, /must run "npm run lint"/);
});

test('check-plan rejects bad paths and guard files in a module plan; warns in a workflow plan', () => {
  repo.write('plans/03-login.md', planText(modulePlan({ files: ['scripts/guard/run.mjs', '/etc/passwd', '../x', 'random.txt', 'plans/03-login.approved.json'] })));
  const all = checkPlan(repo.root, '03-login').errors.join('\n');
  assert.match(all, /scripts\/guard\/run\.mjs: guard files are protected/);
  assert.match(all, /bad file entry "\/etc\/passwd"/);
  assert.match(all, /bad file entry "\.\.\/x"/);
  assert.match(all, /random\.txt: outside the allowed roots/);
  assert.match(all, /approval stamps and the ledger/);

  repo.write('plans/00-wf.md', planText({ module: '00-wf', kind: 'workflow', files: ['scripts/guard/'], scenarios: [], rules: [], commands: ['true'] }));
  const r = checkPlan(repo.root, '00-wf');
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join('\n'), /touches guard files/);
});

test('check-plan: module name must match the file name', () => {
  repo.write('plans/03-login.md', planText(modulePlan({ module: '04-other' })));
  assert.match(checkPlan(repo.root, '03-login').errors.join('\n'), /expected "03-login"/);
});

// ---- approval ----

test('approval is valid until the plan file changes', () => {
  assert.equal(approval(repo.root, '03-login').state, 'missing');
  approve();
  assert.equal(approval(repo.root, '03-login').state, 'valid');
  repo.write('plans/03-login.md', planText(modulePlan(), 'Edited after approval.'));
  const a = approval(repo.root, '03-login');
  assert.equal(a.state, 'void');
  assert.match(a.reason, /changed after approval/);
});

// ---- check-scope ----

test('scope passes for planned files, fails for untracked and committed files outside the plan', () => {
  approve();
  repo.write('src/server/auth/session.ts', 'export {}');
  repo.write('plans/notes.md', 'plans are exempt');
  repo.write('package-lock.json', '{}');
  let r = checkScope(repo.root, '03-login');
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.inside, ['src/server/auth/session.ts']);
  assert.ok(r.exempt.includes('package-lock.json'));

  repo.write('src/server/files/policy.ts', 'export {}');
  r = checkScope(repo.root, '03-login');
  assert.equal(r.ok, false);
  assert.deepEqual(r.outside, ['src/server/files/policy.ts']);

  repo.git('add', '-A');
  repo.git('commit', '-q', '-m', 'sneak it in');
  r = checkScope(repo.root, '03-login');
  assert.deepEqual(r.outside, ['src/server/files/policy.ts'], 'committed after base is still outside');
});

test('scope is not ok without a valid approval', () => {
  repo.write('plans/03-login.md', planText(modulePlan()));
  assert.equal(checkScope(repo.root, '03-login').ok, false);
});

// ---- check-scenarios ----

test('scenarios: all missing before tests exist, covered by it/test names, .skip and .todo do not count', () => {
  repo.write('plans/03-login.md', planText(modulePlan()));
  let r = checkScenarios(repo.root, '03-login');
  assert.deepEqual(r.missing, ['E2', 'F3']);

  repo.write('tests/auth/login.test.ts', 'it("E2: same response", () => {});\nit.skip("F3: db down", () => {});\ntest.todo("F3: later");\n');
  r = checkScenarios(repo.root, '03-login');
  assert.deepEqual(r.covered, ['E2']);
  assert.deepEqual(r.missing, ['F3']);

  repo.write('tests/auth/db.test.ts', 'test.concurrent(`F3: 503, never anonymous`, async () => {});\n');
  assert.equal(checkScenarios(repo.root, '03-login').ok, true);
});

test('scenarios: without a plan file, the module file decides', () => {
  assert.deepEqual(checkScenarios(repo.root, '03-login').missing, ['E2', 'F3']);
});

test('scenarios: a workflow plan without IDs is not applicable', () => {
  repo.write('plans/00-wf.md', planText({ module: '00-wf', kind: 'workflow', files: ['docs/'], scenarios: [], rules: [], commands: ['true'] }));
  assert.equal(checkScenarios(repo.root, '00-wf').applicable, false);
});
