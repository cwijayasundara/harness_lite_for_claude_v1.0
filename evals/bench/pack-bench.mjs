#!/usr/bin/env node
// Phase 3's exit criterion, as a number.
//
// The claim is that a budgeted pack beats reading whole files. The honest baseline is what an
// agent actually does without a graph: grep for the term, then read every file that mentions
// it, in full. If the measured saving is not real, the graph gets cut — that is the deal.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../.claude/lib/graph.mjs';
import { pack, estimateTokens } from '../../.claude/lib/pack.mjs';
import { discover } from '../../.claude/lib/graph.mjs';

// Three levels up from evals/bench/ is the repo root: the harness under .claude/ and the
// artefacts that exercise it are both below this point, so golden answers are repo-relative.
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const GOLDEN = [
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'place_order', answer: 'src/app/service.py' },
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'find_user', answer: 'src/app/repo.py' },
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'slugify', answer: 'web/util.js' },
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'handle', answer: 'src/app/api.py' },
  { root: ROOT, term: 'normalize', answer: '.claude/lib/normalize.mjs' },
  { root: ROOT, term: 'refresh', answer: '.claude/lib/refresh.mjs' },
  { root: ROOT, term: 'toRegExp', answer: 'evals/lib/assertions.mjs' },
  { root: ROOT, term: 'measure', answer: '.claude/checks/budget.mjs' },
  { root: ROOT, term: 'resolveStage', answer: '.claude/lib/config.mjs' },
  { root: ROOT, term: 'renderWiki', answer: '.claude/lib/wiki.mjs' },
];

const cfgFor = (root) => ({
  layout: { root, graph: path.join(root, '.claude', 'state', 'graph.json'), state: path.join(root, '.claude', 'state') },
  graph: { include: ['.', '.claude'], exclude: ['node_modules', '.venv', 'dist', '.git', '__pycache__', 'fixtures'] },
});

// The baseline an agent without a graph actually pays: every file mentioning the term, whole.
function naiveTokens(cfg, term) {
  let total = 0;
  let files = 0;
  for (const rel of discover(cfg)) {
    let text;
    try { text = readFileSync(path.join(cfg.layout.root, rel), 'utf8'); } catch { continue; }
    if (!text.includes(term)) continue;
    total += estimateTokens(text);
    files++;
  }
  return { total, files };
}

export function bench(golden = GOLDEN) {
  const graphs = new Map();
  const rows = [];
  for (const g of golden) {
    if (!graphs.has(g.root)) graphs.set(g.root, build(cfgFor(g.root)));
    const cfg = cfgFor(g.root);
    const r = pack(cfg, graphs.get(g.root), g.term, { budget: 1200 });
    const naive = naiveTokens(cfg, g.term);
    const found = r.included.some((p) => p.module === g.answer);
    rows.push({
      term: g.term, answer: g.answer, recall: found,
      pack_tokens: r.tokens, naive_tokens: naive.total, naive_files: naive.files,
      reduction: naive.total ? 1 - r.tokens / naive.total : 0,
    });
  }
  const recall = rows.filter((r) => r.recall).length / rows.length;
  const packSum = rows.reduce((n, r) => n + r.pack_tokens, 0);
  const naiveSum = rows.reduce((n, r) => n + r.naive_tokens, 0);
  return { rows, recall, pack_tokens: packSum, naive_tokens: naiveSum, reduction: 1 - packSum / naiveSum };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = bench();
  console.log('term          answer                        recall   pack   naive  files  saving');
  for (const x of r.rows) {
    console.log(`${x.term.padEnd(13)} ${x.answer.padEnd(29)} ${(x.recall ? 'hit ' : 'MISS').padEnd(8)} ${String(x.pack_tokens).padStart(5)} ${String(x.naive_tokens).padStart(7)} ${String(x.naive_files).padStart(6)} ${(x.reduction * 100).toFixed(0).padStart(6)}%`);
  }
  console.log(`\nrecall ${(r.recall * 100).toFixed(0)}%  ·  ${r.pack_tokens} vs ${r.naive_tokens} tokens  ·  ${(r.reduction * 100).toFixed(1)}% reduction`);
  const ok = r.recall >= 0.9 && r.reduction >= 0.5;
  console.log(ok ? 'PASS — the graph earns its place' : 'FAIL — Phase 3 exit criterion not met; cut the graph rather than keep it out of sentiment');
  process.exit(ok ? 0 : 1);
}
