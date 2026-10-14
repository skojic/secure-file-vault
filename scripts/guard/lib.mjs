// Shared helpers for the guard scripts. Every function takes the repo root explicitly so tests can
// point it at a fixture repo. Parsers fail closed: zero matches is an error, never an empty pass.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, relative, isAbsolute, dirname } from 'node:path';
import {
  ALLOWED_ROOTS, ALLOWED_ROOT_FILES, PROTECTED, NEVER_EDIT, LEDGER_DIR, HISTORY_LIMIT,
  SUMMARY_LINES, REDACTIONS,
} from './config.mjs';

export class GuardError extends Error {}

export function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function repoRoot(cwd = process.cwd()) {
  return git(cwd, ['rev-parse', '--show-toplevel']).trim();
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function read(root, rel) {
  const path = join(root, rel);
  if (!existsSync(path)) throw new GuardError(`missing file: ${rel}`);
  return readFileSync(path, 'utf8');
}

// ---- Docs parsers -------------------------------------------------------------------------------

const SCENARIO_ENTRY = /^- \*\*([HFEB]\d+)\.\s/;

export function scenarioFiles(root) {
  const dir = join(root, 'docs/scenarios');
  if (!existsSync(dir)) throw new GuardError('missing directory: docs/scenarios');
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
    .map((f) => `docs/scenarios/${f}`);
}

// Map of scenario ID -> entry text (the "- **ID." line plus its indented lines).
export function scenarioEntries(root) {
  const entries = new Map();
  for (const rel of scenarioFiles(root)) {
    let current = null;
    for (const line of read(root, rel).split('\n')) {
      const m = line.match(SCENARIO_ENTRY);
      if (m) {
        if (entries.has(m[1])) throw new GuardError(`duplicate scenario ID ${m[1]} in ${rel}`);
        current = [line];
        entries.set(m[1], current);
      } else if (current && /^\s+\S/.test(line)) {
        current.push(line);
      } else {
        current = null;
      }
    }
  }
  if (entries.size === 0) throw new GuardError('parsed zero scenario IDs from docs/scenarios/ (format changed?)');
  return new Map([...entries].map(([id, lines]) => [id, lines.join('\n')]));
}

export function ruleNumbers(root) {
  const nums = [...read(root, 'docs/security/rules.md').matchAll(/^(\d+)\.\s/gm)].map((m) => Number(m[1]));
  if (nums.length === 0) throw new GuardError('parsed zero rules from docs/security/rules.md (format changed?)');
  return new Set(nums);
}

export function moduleDocPath(module) {
  return `docs/modules/${module}.md`;
}

export function moduleScenarios(root, module) {
  const lines = read(root, moduleDocPath(module)).split('\n');
  const at = lines.findIndex((l) => l.trim() === '## Scenarios');
  if (at === -1) throw new GuardError(`${moduleDocPath(module)} has no "## Scenarios" heading`);
  const body = lines.slice(at + 1).find((l) => l.trim() !== '') ?? '';
  const ids = [...new Set(body.match(/\b[HFEB]\d+\b/g) ?? [])];
  if (ids.length === 0) throw new GuardError(`parsed zero scenario IDs under "## Scenarios" in ${moduleDocPath(module)}`);
  return ids;
}

// ---- Plans and approval -------------------------------------------------------------------------

export const planPath = (module) => `plans/${module}.md`;
export const stampPath = (module) => `plans/${module}.approved.json`;

export function moduleFromPlanPath(path) {
  const m = path.replace(/\\/g, '/').match(/(?:^|\/)plans\/([^/]+)\.md$/);
  if (!m) throw new GuardError(`not a plan path (expected plans/<module>.md): ${path}`);
  return m[1];
}

export function readPlan(root, module) {
  const rel = planPath(module);
  const text = read(root, rel);
  const blocks = [...text.matchAll(/^```json plan\n([\s\S]*?)^```$/gm)];
  if (blocks.length !== 1) throw new GuardError(`${rel} must contain exactly one \`\`\`json plan block (found ${blocks.length})`);
  let plan;
  try {
    plan = JSON.parse(blocks[0][1]);
  } catch (err) {
    throw new GuardError(`${rel}: plan block is not valid JSON: ${err.message}`);
  }
  return { rel, text, plan, hash: sha256(text) };
}

// state: "missing" | "void" (plan changed after approval) | "valid"
export function approval(root, module) {
  const rel = stampPath(module);
  if (!existsSync(join(root, rel))) return { state: 'missing' };
  let stamp;
  try {
    stamp = JSON.parse(read(root, rel));
  } catch {
    return { state: 'void', reason: `${rel} is not valid JSON` };
  }
  const { hash } = readPlan(root, module);
  if (stamp.sha256 !== hash) return { state: 'void', reason: 'plan changed after approval', stamp };
  return { state: 'valid', stamp };
}

export function activeModule(root) {
  if (process.env.GUARD_MODULE) return process.env.GUARD_MODULE;
  const path = join(root, LEDGER_DIR, 'active');
  return existsSync(path) ? readFileSync(path, 'utf8').trim() || null : null;
}

// ---- Paths --------------------------------------------------------------------------------------

export const matchesAny = (rel, entries) =>
  entries.some((e) => (e.endsWith('/') ? rel.startsWith(e) : rel === e));

export function toRepoPath(root, path) {
  const rel = (isAbsolute(path) ? relative(root, path) : path).replace(/\\/g, '/');
  return rel.startsWith('../') || rel === '..' || isAbsolute(rel) ? null : rel;
}

export const isAllowedRoot = (rel) => matchesAny(rel, ALLOWED_ROOTS) || ALLOWED_ROOT_FILES.includes(rel);
export const isProtected = (rel) => matchesAny(rel, PROTECTED);
export const isNeverEdit = (rel) => NEVER_EDIT.some((re) => re.test(rel));

// Paths changed since `base`, committed or not, plus untracked files. Reads git, so it sees writes
// made by any tool, not only the editor tools a hook can intercept.
export function changedPaths(root, base) {
  const diff = git(root, ['diff', '--name-only', '-z', base]).split('\0');
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0');
  return [...new Set([...diff, ...untracked].filter(Boolean))].sort();
}

// Content hash of every tracked and untracked non-ignored file. Deleted files hash as deleted.
export function treeHash(root) {
  const files = git(root, ['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const h = createHash('sha256');
  for (const rel of [...new Set(files)].sort()) {
    const path = join(root, rel);
    h.update(rel).update('\0').update(existsSync(path) ? readFileSync(path) : '<deleted>').update('\0');
  }
  return h.digest('hex');
}

export function hashPaths(root, rels) {
  const h = createHash('sha256');
  for (const rel of rels) h.update(rel).update('\0').update(existsSync(join(root, rel)) ? readFileSync(join(root, rel)) : '<absent>').update('\0');
  return h.digest('hex');
}

export function walk(root, dir, filter = () => true) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...walk(root, rel, filter));
    } else if (filter(rel)) out.push(rel);
  }
  return out.sort();
}

// ---- Output scrubbing (rule 5) ------------------------------------------------------------------

export function redact(line) {
  return REDACTIONS.reduce((acc, [re, sub]) => acc.replace(re, sub), line);
}

export function summarize(output, max = SUMMARY_LINES) {
  return output.split('\n').map((l) => redact(l).trimEnd()).filter((l) => l.trim() !== '').slice(-max);
}

// ---- Ledger -------------------------------------------------------------------------------------

const ledgerPath = (root, ...parts) => join(root, LEDGER_DIR, ...parts);

function writeFile(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

export function readStatus(root, module) {
  const path = ledgerPath(root, 'status', `${module}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { module, gates: {} };
}

export function writeStatus(root, module, status) {
  writeFile(ledgerPath(root, 'status', `${module}.json`), `${JSON.stringify(status, null, 2)}\n`);
}

export function appendJsonl(root, kind, module, record, limit = HISTORY_LIMIT) {
  const path = ledgerPath(root, kind, `${module}.jsonl`);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  if (lines.length > limit) writeFileSync(path, `${lines.slice(-limit).join('\n')}\n`);
}

export function readJsonl(root, kind, module) {
  const path = ledgerPath(root, kind, `${module}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function writeLedgerFile(root, rel, data) {
  writeFile(ledgerPath(root, rel), data);
}

export function readLedgerFile(root, rel) {
  const path = ledgerPath(root, rel);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

// ---- CLI and hook helpers -----------------------------------------------------------------------

export async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

// Runs a CLI main. GuardError and any other error exit 1 with a message; stack only for real bugs.
export async function cli(main) {
  try {
    process.exitCode = (await main()) ?? 0;
  } catch (err) {
    console.error(err instanceof GuardError ? `guard: ${err.message}` : `guard: internal error: ${err.stack}`);
    process.exitCode = 1;
  }
}
