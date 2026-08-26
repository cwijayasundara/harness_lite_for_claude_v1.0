// A budgeted context pack: file:line slices instead of whole files.
//
// The claim this makes is measurable, so it is measured — evals/bench/pack-bench.mjs scores
// recall against naive full-file reads on golden queries. If the saving is not real, Phase 3's
// exit criterion says the graph gets cut rather than kept out of sentiment.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { query } from './graph.mjs';

export const estimateTokens = (text) => Math.ceil(text.length / 4);

function slice(root, module, start, end) {
  const abs = path.join(root, module);
  if (!existsSync(abs)) return null;
  const lines = readFileSync(abs, 'utf8').split('\n');
  return lines.slice(start - 1, Math.min(end, lines.length)).join('\n');
}

// A module skeleton: its imports and its symbol signatures, never its bodies.
function skeleton(root, module, m) {
  const lines = readFileSync(path.join(root, module), 'utf8').split('\n');
  const out = m.symbols.map((s) => `${String(s.start).padStart(4)}  ${lines[s.start - 1].trim()}`);
  return [`imports: ${m.imports.join(', ') || '(none)'}`, ...out].join('\n');
}

export function pack(cfg, g, question, { budget = 1200 } = {}) {
  const root = cfg.layout.root;
  const term = question.trim().replace(/[?.]$/, '').split(/\s+/).pop();
  const pieces = [];
  const add = (kind, module, start, end, text) => { if (text) pieces.push({ kind, module, start, end, text, tokens: estimateTokens(text) }); };

  // 1. exact module path
  if (g.modules[term]) {
    add('skeleton', term, 1, g.modules[term].lines, skeleton(root, term, g.modules[term]));
  }

  // 2. exact symbol: definition, then what it calls, then who calls it.
  const defs = [];
  for (const [rel, m] of Object.entries(g.modules)) for (const s of m.symbols) if (s.name === term) defs.push({ ...s, module: rel });
  for (const d of defs) add('definition', d.module, d.start, d.end, slice(root, d.module, d.start, d.end));

  if (defs.length) {
    for (const callee of query(g, 'calls', term)) {
      for (const [rel, m] of Object.entries(g.modules)) {
        const s = m.symbols.find((x) => x.name === callee);
        if (s) { add('callee', rel, s.start, s.start, slice(root, rel, s.start, s.start)); break; }
      }
    }
    for (const c of query(g, 'callers', term)) {
      add('caller', c.module, c.start, Math.min(c.end, c.start + 12), slice(root, c.module, c.start, Math.min(c.end, c.start + 12)));
    }
  }

  // 3. nothing exact: substring match over symbol names, signatures only.
  if (!pieces.length) {
    const needle = term.toLowerCase();
    for (const [rel, m] of Object.entries(g.modules)) {
      for (const s of m.symbols) {
        if (!s.name.toLowerCase().includes(needle)) continue;
        add('candidate', rel, s.start, s.start, slice(root, rel, s.start, s.start));
      }
    }
  }

  // Greedy fill in priority order; what does not fit is named, never silently dropped.
  const order = { definition: 0, skeleton: 1, callee: 2, caller: 3, candidate: 4 };
  pieces.sort((a, b) => order[a.kind] - order[b.kind] || a.module.localeCompare(b.module) || a.start - b.start);
  const included = [];
  let used = 0;
  const omitted = [];
  for (const p of pieces) {
    if (used + p.tokens <= budget) { included.push(p); used += p.tokens; }
    else omitted.push(`${p.module}:${p.start} (${p.kind})`);
  }
  return { question, term, budget, tokens: used, included, omitted, hit: included.length > 0 };
}

export function renderPack(r) {
  if (!r.hit) {
    return [`no graph entry for "${r.term}".`,
      `The graph is a cache, not an authority — fall back to: grep -rn "${r.term}" .`].join('\n');
  }
  const out = [`# context pack: ${r.term}   (~${r.tokens} tokens of ${r.budget})`];
  for (const p of r.included) {
    out.push('', `## ${p.kind} — ${p.module}:${p.start}-${p.end}`, '```', p.text, '```');
  }
  if (r.omitted.length) out.push('', `omitted for budget: ${r.omitted.join(', ')}`);
  return out.join('\n');
}
