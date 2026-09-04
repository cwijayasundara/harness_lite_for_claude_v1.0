// Pure functions a campaign task needs and the 22 golden tasks never do: that a later sprint's
// requirement was not reachable early (B2), that every approved behaviour still has a test
// naming it (B6), and that a named file was edited rather than deleted and rewritten (B4).
// File-and-text checks over a staged directory, deterministic, no model, no spend.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const IGNORE = /(^|\/)(\.git|node_modules|\.aidlc\/state|__pycache__|\.pytest_cache|\.ruff_cache)(\/|$)/;

function walk(root, rel = '') {
  const out = [];
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (IGNORE.test(r)) continue;
    if (e.isDirectory()) out.push(...walk(root, r));
    else out.push(r);
  }
  return out;
}

// B2. A campaign fixture holds no sprint prompts — they live in tasks.json, never the fixture —
// so the only way an earlier step could see a later one is a leak into the working copy itself:
// the fixture, a prior step's output, or an agent quoting the future back to itself. `needles`
// is the later step's requirement text, duplicated into the earlier step's assertion; that
// duplication is the price of a check that stays a pure function of the current working copy.
export function unseenRequirements(dir, needles) {
  const list = Array.isArray(needles) ? needles : [needles];
  const found = [];
  for (const rel of walk(dir)) {
    let content;
    try { content = readFileSync(path.join(dir, rel), 'utf8'); } catch { continue; }
    for (const n of list) {
      if (found.includes(n)) continue;
      if (content.includes(n)) found.push(n);
    }
  }
  return {
    ok: found.length === 0,
    violations: found.map((n) => `"${n}" already appears in the working copy — a later sprint's requirement has leaked early`),
  };
}

function frontmatterStatus(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const s = m[1].match(/^status:\s*(\S+)/m);
  return s ? s[1] : null;
}

// A Proof row is `| B<n> | <path>::<identifier> |` — the shape every plan.md in this repo
// already writes it in (see .aidlc/artifacts/*/plan.md). A row in a different shape is not one
// this check can verify and is skipped rather than guessed at.
function parseProofRows(planText) {
  const rows = new Map();
  for (const line of planText.split('\n')) {
    const m = line.match(/^\|\s*(B\d+)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    const evidence = m[2].replace(/`/g, '');
    const pair = evidence.match(/([^\s|]+)::([^\s|]+)/);
    if (pair) rows.set(m[1], { file: pair[1], identifier: pair[2] });
  }
  return rows;
}

// B6. Every `### B<n>` in every approved spec must trace to a test through its plan's Proof
// table, and the file that table names must actually contain the identifier it claims. A spec
// that has quietly become fiction — a behaviour nobody proves any more — is the defect this
// whole change exists to find. A behaviour retired on purpose is retired by removing it from
// spec.md, so it is simply absent from the loop below and never fires.
export function behavioursHaveTests(dir) {
  const violations = [];
  const artifactsRoot = path.join(dir, '.aidlc', 'artifacts');
  if (!existsSync(artifactsRoot)) return { ok: true, violations };
  for (const slug of readdirSync(artifactsRoot)) {
    const specPath = path.join(artifactsRoot, slug, 'spec.md');
    const planPath = path.join(artifactsRoot, slug, 'plan.md');
    if (!existsSync(specPath) || !statSync(specPath).isFile() || !existsSync(planPath)) continue;
    const specText = readFileSync(specPath, 'utf8');
    if (frontmatterStatus(specText) !== 'approved') continue;
    const behaviours = [...specText.matchAll(/^### (B\d+)\b/gm)].map((m) => m[1]);
    if (!behaviours.length) continue;
    const proof = parseProofRows(readFileSync(planPath, 'utf8'));
    for (const b of behaviours) {
      const row = proof.get(b);
      if (!row) { violations.push(`${slug} ${b}: plan.md's Proof table names no test`); continue; }
      const testFile = path.join(dir, row.file);
      if (!existsSync(testFile)) { violations.push(`${slug} ${b}: proof file "${row.file}" does not exist`); continue; }
      if (!readFileSync(testFile, 'utf8').includes(row.identifier)) {
        violations.push(`${slug} ${b}: "${row.file}" no longer contains "${row.identifier}"`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// B4. An agent that deletes the inconvenient test and writes a fresh one passes a naive suite —
// the file still exists, something still asserts something. What distinguishes an edit from a
// deletion-and-rewrite is whether the earlier proof survives: the specific identifiers (test
// names, in practice) a prior sprint's own assertion already required to exist. Those are known
// ahead of time, the same way B2's later-sprint text is, and are passed in rather than guessed.
export function modifiedNotReplaced(dir, file, markers) {
  const list = Array.isArray(markers) ? markers : [markers];
  const abs = path.join(dir, file);
  if (!existsSync(abs)) return { ok: false, violations: [`${file} no longer exists`] };
  const content = readFileSync(abs, 'utf8');
  const missing = list.filter((m) => !content.includes(m));
  return {
    ok: missing.length === 0,
    violations: missing.map((m) => `${file} no longer contains "${m}" — edited-in-place would have kept it`),
  };
}
