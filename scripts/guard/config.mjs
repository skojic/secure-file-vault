// Guard configuration. Paths mirror docs/architecture/overview.md and docs/modules/01-setup.md;
// when the folder layout changes there, change it here in the same PR.

// Directories a plan may list (trailing slash = prefix).
export const ALLOWED_ROOTS = ['src/', 'tests/', 'scripts/', 'docs/', 'plans/', 'public/', '.github/'];

// Root-level files a plan may list.
export const ALLOWED_ROOT_FILES = [
  'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.mjs', '.nvmrc', '.env.example',
  'docker-compose.yml', 'drizzle.config.ts', 'vitest.config.mts', 'playwright.config.ts', 'next.config.ts',
  'postcss.config.mjs', 'README.md', 'AGENTS.md', 'CLAUDE.md', '.gitignore', 'CODEOWNERS',
];

// Only a human-approved plan of kind "workflow" that lists them explicitly may touch these.
export const PROTECTED = ['scripts/guard/', '.claude/'];

// Never edited by an agent tool: written only by approve-plan.mjs and the ledger scripts.
export const NEVER_EDIT = [/^plans\/.+\.approved\.json$/, /^\.guard\//];

// Editable while no plan is active (documentation-only work). Once a plan is active, only its files.
export const FREE_WITHOUT_PLAN = ['docs/', 'plans/', 'CLAUDE.local.md'];

// Changed but generated: exempt from the scope check.
export const GENERATED = ['package-lock.json', 'src/server/db/migrations/', 'next-env.d.ts'];

// Every module plan must run these (AGENTS.md "Working loop", step 3).
export const REQUIRED_MODULE_COMMANDS = ['npm run lint', 'npm run typecheck', 'npm test'];

export const LEDGER_DIR = '.guard';
export const HISTORY_LIMIT = 200;
export const SUMMARY_LINES = 20;
export const HANDOFF_MAX_CHARS = 4000;

// Rule 5: ledger summaries must not carry secrets. Applied to every stored line.
export const REDACTIONS = [
  [/\x1b\[[0-9;]*[A-Za-z]/g, ''],
  [/\b(authorization|set-cookie|cookie)(["']?\s*[:=]\s*).*$/gim, '$1$2[redacted]'],
  [/\b(password|passwd|secret|token|api[_-]?key)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2[redacted]'],
  [/\bBearer\s+\S+/gi, 'Bearer [redacted]'],
  [/(?<![\w/.-])[A-Za-z0-9_-]{32,}(?![\w/.-])/g, '[redacted]'],
];
