// Test fixture: a throwaway git repo with the docs shapes the guard parses.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export const SCENARIOS = `# Edge cases (E)

## Identity and sessions
- **E1. Username lookalikes** — \`Admin\`
  - **Proposal:** normalise
  - **Test:** they collide
- **E2. Login timing** — enumeration
  - **Proposal:** dummy verify
  - **Test:** same response
`;

export const FAILURES = `# Failures (F)

- **F3. Database down** — sessions
  - **Proposal:** 503
  - **Test:** never anonymous
`;

export const RULES = `# Security rules (binding)

## Authorization
1. Every route calls getCurrentUser().
2. canAccessFile is the only rule.
5. Never log secrets.
`;

export const MODULE = `# 03 · Login

## Scenarios
E2 (timing), F3 (DB down)

## Done when
- it works
`;

export function planText(plan, prose = 'A test plan.') {
  return `# Plan\n\n${prose}\n\n\`\`\`json plan\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n`;
}

export const modulePlan = (overrides = {}) => ({
  module: '03-login',
  kind: 'module',
  files: ['src/server/auth/', 'tests/auth/'],
  scenarios: ['E2', 'F3'],
  rules: [1, 5],
  commands: ['npm run lint', 'npm run typecheck', 'npm test'],
  ...overrides,
});

export function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'guard-fixture-'));
  const write = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  write('.gitignore', '.guard/\nnode_modules/\n');
  write('docs/scenarios/README.md', '# Scenarios\n- **E99. Format example** — README is not an entry file\n');
  write('docs/scenarios/edge-cases.md', SCENARIOS);
  write('docs/scenarios/failures.md', FAILURES);
  write('docs/security/rules.md', RULES);
  write('docs/modules/03-login.md', MODULE);
  git('add', '-A');
  git('commit', '-q', '-m', 'docs');
  return { root, write, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
