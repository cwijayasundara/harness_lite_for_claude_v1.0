#!/usr/bin/env node
// Phase 3's exit criterion, as a number.
//
// The claim is that a budgeted pack beats reading whole files. The honest baseline is what an
// agent actually does without a graph: grep for the term, then read every file that mentions
// it, in full. If the measured saving is not real, the graph gets cut — that is the deal.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from '../../.aidlc/lib/graph.mjs';
import { pack, estimateTokens } from '../../.aidlc/lib/pack.mjs';
import { discover } from '../../.aidlc/lib/graph.mjs';

// Three levels up from evals/bench/ is the repo root: the harness under .aidlc/ and the
// artefacts that exercise it are both below this point, so golden answers are repo-relative.
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const GOLDEN = [
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'place_order', answer: 'src/app/service.py' },
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'find_user', answer: 'src/app/repo.py' },
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'slugify', answer: 'web/util.js' },
  { root: path.join(ROOT, 'evals', 'fixtures', 'graph-app'), term: 'handle', answer: 'src/app/api.py' },
  { root: ROOT, term: 'normalize', answer: '.aidlc/lib/normalize.mjs' },
  { root: ROOT, term: 'refresh', answer: '.aidlc/lib/refresh.mjs' },
  { root: ROOT, term: 'toRegExp', answer: 'evals/lib/assertions.mjs' },
  { root: ROOT, term: 'measure', answer: '.aidlc/checks/budget.mjs' },
  { root: ROOT, term: 'resolveStage', answer: '.aidlc/lib/config.mjs' },
  { root: ROOT, term: 'renderPack', answer: '.aidlc/lib/pack.mjs' },
];

const cfgFor = (root) => ({
  layout: { root, graph: path.join(root, '.aidlc', 'state', 'graph.json'), state: path.join(root, '.aidlc', 'state') },
  graph: { include: ['.', '.aidlc'], exclude: ['node_modules', '.venv', 'dist', '.git', '__pycache__', 'fixtures'] },
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

// Competent non-graph navigation: literal rg hits with bounded surrounding reads.
// Same discoverable files and 1,200-token ceiling; no expected answer influences retrieval.
export function boundedSearch(cfg, term, budget = 1200) {
  const files=discover(cfg);
  const out=spawnSync('rg',['--json','--fixed-strings','--',term,...files],{cwd:cfg.layout.root,encoding:'utf8',maxBuffer:32e6});
  if(out.error || ![0,1].includes(out.status))throw new Error(`rg unavailable: ${out.error?.message??out.stderr}`);
  const matches=out.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.type==='match');
  const pieces=[];let tokens=0;
  // Definitions first, then references. This ranking uses source syntax, not golden answers.
  matches.sort((a,b)=>Number(/(?:function|def|const|class)\s/.test(b.data.lines.text))-Number(/(?:function|def|const|class)\s/.test(a.data.lines.text)));
  for(const {data} of matches){
    const file=data.path.text;if(pieces.some(p=>p.module===file))continue;
    const lines=readFileSync(path.join(cfg.layout.root,file),'utf8').split('\n');
    const start=Math.max(0,data.line_number-4),end=Math.min(lines.length,data.line_number+12);
    const text=`${file}:${start+1}-${end}\n${lines.slice(start,end).join('\n')}`;
    const cost=estimateTokens(text);if(tokens+cost>budget)continue;
    tokens+=cost;pieces.push({module:file,text});
  }
  return {tokens,included:pieces};
}

export function bench(golden = GOLDEN) {
  const graphs = new Map();
  const rows = [];
  for (const g of golden) {
    if (!graphs.has(g.root)) graphs.set(g.root, build(cfgFor(g.root)));
    const cfg = cfgFor(g.root);
    const r = pack(cfg, graphs.get(g.root), g.term, { budget: 1200 });
    const naive = naiveTokens(cfg, g.term);
    const bounded = boundedSearch(cfg, g.term);
    if (!graphs.get(g.root).modules[g.answer]?.symbols.some(s=>s.name===g.term)) throw new Error(`golden symbol missing: ${g.term} in ${g.answer}`);
    const found = r.included.some((p) => p.module === g.answer);
    rows.push({
      term: g.term, answer: g.answer, recall: found,
      bounded_tokens: bounded.tokens, bounded_recall: bounded.included.some(p=>p.module===g.answer),
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
  console.log('Bounded rg comparison:', JSON.stringify(r.rows.map(({term,pack_tokens,bounded_tokens,recall,bounded_recall})=>({term,pack_tokens,bounded_tokens,recall,bounded_recall}))));
  const ok = r.recall >= 0.9;
  console.log(ok ? 'PASS — graph retrieval recall; comparative benefit requires product evidence' : 'FAIL — graph retrieval recall below 90%');
  process.exit(ok ? 0 : 1);
}
