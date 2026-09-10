// A navigation cache, not a compiler (Law 7).
//
// Deliberately zero-dependency and line-oriented. The plan said "tree-sitter"; tree-sitter
// means either native bindings or vendored wasm, and a harness that must run on a cold clone
// with no install step cannot have either. So: module-level import edges are high fidelity,
// symbol-level call edges are heuristic and filtered against the known symbol table. Both are
// good enough for navigation and neither is ever a required input — when the graph misses,
// the caller is told to grep.
//
// It indexes dotdirs. v6's graph skipped them with one line, which made the 48k LOC that WAS
// the harness invisible to it; test/graph.test.mjs asserts the opposite.

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { coedit, head as coeditHead } from './coedit.mjs';
import { hubs, coeditHubs } from './rank.mjs';
import path from 'node:path';

// Bumped whenever the SHAPE or the DERIVATION SEMANTICS of the index change, not just its
// fields: `reusableCoedit` carries a previous build's co-edit weights forward while HEAD holds
// still, so a change to how those weights are derived is invisible to it unless the version moves.
// That is how a weight threshold added here first appeared to do nothing.
export const GRAPH_VERSION = 6;

// code-property-graph B1. The three edge kinds this index carries, named so a caller can ask for
// one and receive only that one.
export const EDGE_TYPES = ['import', 'call', 'co-edit'];

const LANG_BY_EXT = {
  '.py': 'py', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
  '.ts': 'js', '.tsx': 'js', '.go': 'go', '.java': 'java', '.rs': 'rs',
};

const RESERVED = new Set([
  'if', 'for', 'while', 'return', 'print', 'len', 'str', 'int', 'float', 'dict', 'list', 'set',
  'tuple', 'bool', 'range', 'super', 'isinstance', 'type', 'open', 'sorted', 'enumerate', 'zip',
  'function', 'switch', 'catch', 'typeof', 'await', 'new', 'require', 'import', 'export',
  'constructor', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Promise', 'RegExp',
  'and', 'or', 'not', 'in', 'is', 'elif', 'else', 'try', 'except', 'with', 'assert', 'raise', 'lambda',
]);

// ---------------------------------------------------------------- file discovery
// the-index-tracks-the-source B1. Directories the harness itself writes, never project source.
//
// why: 451 of this repository's 543 indexed modules were the harness's own output — 377 recorded
// comparison runs, 50 agent worktree copies, 17 product runs — against 92 real source modules.
// That made the audit's ambiguity list one `src/ledger.mjs` copied sixty times, and would have
// made PageRank rank those copies as the most central files in the repository.
//
// Here rather than in `harness.toml` because a default is a value each project may edit away, and
// a project that edits it away silently re-indexes its own test history. A project's own
// `[graph] exclude` is unioned with this, never replaced by it. `.aidlc/artifacts/**` holds
// hand-written reproduction scripts and stays indexed.
export const HARNESS_OUTPUT = ['.aidlc/evals', '.claude/worktrees'];

const isHarnessOutput = (rel) => HARNESS_OUTPUT.some((p) => rel === p || rel.startsWith(`${p}/`));

function walk(root, rel, exclude, out) {
  const abs = path.join(root, rel);
  let entries;
  try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (exclude.includes(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    // The project's list matches a basename; this one matches a path, because the directories it
    // names are only the harness's output at those exact locations.
    if (isHarnessOutput(r)) continue;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { walk(root, r, exclude, out); continue; }
    out.push(r);
  }
  return out;
}

function langOf(root, rel) {
  const ext = path.extname(rel);
  if (LANG_BY_EXT[ext]) return LANG_BY_EXT[ext];
  if (ext) return null;
  // Extensionless executables (bin/harness) are real source and must not be invisible.
  try {
    const first = readFileSync(path.join(root, rel), 'utf8').slice(0, 120).split('\n')[0];
    if (!first.startsWith('#!')) return null;
    if (first.includes('node')) return 'js';
    if (first.includes('python')) return 'py';
  } catch { /* unreadable */ }
  return null;
}

export function discover(cfg) {
  const root = cfg.layout.root;
  const exclude = cfg.graph?.exclude ?? [];
  const include = cfg.graph?.include ?? ['.'];
  const seen = new Set();
  for (const inc of include) {
    const rel = inc === '.' ? '' : inc.replace(/^\.\//, '');
    if (!existsSync(path.join(root, rel))) continue;
    for (const f of walk(root, rel, exclude, [])) seen.add(f);
  }
  return [...seen].filter((f) => langOf(root, f)).sort();
}

// ---------------------------------------------------------------- extraction
const PY_IMPORT = /^\s*(?:from\s+([.\w]+)\s+import\s+(.+)|import\s+([\w.,\s]+))/;
const JS_IMPORT = /(?:^\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"])/;
const GO_IMPORT = /^\s*(?:import\s+)?(?:[\w.]+\s+)?"([^"]+)"/;
const JAVA_IMPORT = /^\s*import\s+(?:static\s+)?([\w.]+);/;
const RS_IMPORT = /^\s*(?:pub\s+)?use\s+([\w:]+)/;

const DEFS = {
  py: [
    [/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/, 'function'],
    [/^(\s*)class\s+(\w+)\b/, 'class'],
  ],
  js: [
    [/^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*\(/, 'function'],
    [/^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|\w+\s*=>)/, 'function'],
    [/^(\s*)(?:export\s+)?class\s+(\w+)\b/, 'class'],
  ],
  go: [[/^(\s*)func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/, 'function'], [/^(\s*)type\s+(\w+)\s+struct\b/, 'class']],
  java: [[/^(\s*)(?:public|private|protected|static|final|\s)*[\w<>\[\],.]+\s+(\w+)\s*\([^;]*\)\s*\{/, 'method'], [/^(\s*)(?:public\s+)?(?:final\s+)?class\s+(\w+)\b/, 'class']],
  rs: [[/^(\s*)(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[(<]/, 'function'], [/^(\s*)(?:pub\s+)?struct\s+(\w+)\b/, 'class']],
};

function rawImports(lang, lines) {
  const out = [];
  for (const line of lines) {
    let m;
    if (lang === 'py') {
      if ((m = line.match(PY_IMPORT))) {
        if (m[1]) {
          // "from app import cycle_b" — the imported names may themselves be modules.
          out.push(m[1]);
          for (const name of m[2].replace(/[()]/g, '').split(',')) {
            const n = name.trim().split(/\s+as\s+/)[0];
            if (n && n !== '*') out.push(`${m[1]}.${n}`);
          }
        } else if (m[3]) for (const n of m[3].split(',')) out.push(n.trim().split(/\s+as\s+/)[0]);
      }
    } else if (lang === 'js') {
      if ((m = line.match(JS_IMPORT))) out.push(m[1] ?? m[2] ?? m[3]);
    } else if (lang === 'go') { if (/^\s*(import\s+)?"/.test(line) && (m = line.match(GO_IMPORT))) out.push(m[1]); }
    else if (lang === 'java') { if ((m = line.match(JAVA_IMPORT))) out.push(m[1]); }
    else if (lang === 'rs') { if ((m = line.match(RS_IMPORT))) out.push(m[1]); }
  }
  return [...new Set(out.filter(Boolean))];
}

const indentOf = (s) => (s.match(/^\s*/) ?? [''])[0].length;

function symbolsOf(lang, lines) {
  const patterns = DEFS[lang] ?? [];
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    for (const [re, kind] of patterns) {
      const m = lines[i].match(re);
      if (!m) continue;
      found.push({ name: m[2], kind, start: i + 1, indent: m[1].length });
      break;
    }
  }
  // A definition ends where the next definition at the same or shallower indent begins.
  for (let i = 0; i < found.length; i++) {
    const next = found.slice(i + 1).find((s) => s.indent <= found[i].indent);
    found[i].end = next ? next.start - 1 : lines.length;
  }
  // Nested definitions (methods) are kept, but the enclosing class must not swallow their calls.
  for (const s of found) {
    const inner = found.filter((o) => o !== s && o.start > s.start && o.end <= s.end && o.indent > s.indent);
    const body = lines.slice(s.start - 1, s.end)
      .filter((_, idx) => !inner.some((o) => s.start + idx >= o.start && s.start + idx <= o.end));
    s.candidates = callCandidates(body.join('\n'), s.name);
    delete s.indent;
  }
  return found;
}

// Template literals and f-strings interpolate real expressions, so blanking them wholesale
// loses every call made inside one — which in JS/TS is a large share of them. Keep the
// interiors, drop the literal text.
const keepInterpolations = (lit) => [...lit.matchAll(/\$?\{([^{}]*)\}/g)].map((m) => m[1]).join(' ');

function callCandidates(body, self) {
  const stripped = body
    .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, keepInterpolations)
    .replace(/\bf(["'])(?:\\.|(?!\1)[^\\])*\1/g, keepInterpolations)
    .replace(/(^|[^\\])(["'])(?:\\.|(?!\2)[^\\])*\2/g, '$1 ')
    .replace(/#.*$/gm, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = new Set();
  for (const m of stripped.matchAll(/(\w+)\s*\(/g)) {
    const n = m[1];
    if (n === self || RESERVED.has(n) || /^\d/.test(n)) continue;
    out.add(n);
  }
  return [...out];
}

// ---------------------------------------------------------------- resolution
function resolver(modules) {
  const byPath = new Set(Object.keys(modules));
  // "app.models" -> any indexed file whose path ends with app/models.<ext>
  const bySuffix = new Map();
  for (const m of byPath) {
    const noExt = m.replace(/\.[^./]+$/, '').replace(/\/__init__$|\/index$/, '');
    for (const parts of [noExt.split('/')]) {
      for (let i = 0; i < parts.length; i++) {
        const key = parts.slice(i).join('.');
        if (!bySuffix.has(key)) bySuffix.set(key, []);
        bySuffix.get(key).push(m);
      }
    }
  }
  return function resolve(fromModule, spec) {
    if (spec.startsWith('.') && spec.includes('/')) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromModule), spec));
      for (const cand of [base, `${base}.js`, `${base}.mjs`, `${base}.ts`, `${base}/index.js`]) {
        if (byPath.has(cand)) return cand;
      }
      return null;
    }
    const key = spec.replace(/^\.+/, '').replace(/[/:]+/g, '.');
    const hits = bySuffix.get(key) ?? [];
    if (hits.length !== 1) return hits.length > 1 ? hits.sort()[0] : null;
    return hits[0];
  };
}

// ---------------------------------------------------------------- build
export function build(cfg, { only = null, previous = null } = {}) {
  const root = cfg.layout.root;
  // B6. `only` comes from a caller's dirty list, not from `discover()`, so it never passed
  // through `walk()`'s exclusions. No caller passes it today; the incremental refresh work is
  // what would give it one, and it would silently re-index the 451 modules of the harness's own
  // output that the full path excludes. Fixed while it is still latent.
  const files = (only ?? discover(cfg)).filter((rel) => !isHarnessOutput(rel));
  const modules = only && previous ? { ...previous.modules } : {};
  for (const rel of files) {
    const lang = langOf(root, rel);
    if (!lang) continue;
    let text;
    try { if (statSync(path.join(root, rel)).size > 1_500_000) continue; text = readFileSync(path.join(root, rel), 'utf8'); }
    catch { delete modules[rel]; continue; }
    const lines = text.split('\n');
    modules[rel] = { lang, raw_imports: rawImports(lang, lines), symbols: symbolsOf(lang, lines), lines: lines.length };
  }
  if (only && previous) for (const rel of files) if (!existsSync(path.join(root, rel))) delete modules[rel];

  const resolve = resolver(modules);
  // B2. The audit stage, folded into the resolution it audits so the two cannot disagree.
  //
  // why: `.filter((x) => x)` dropped every specifier that resolved to nothing, silently. Most of
  // those are external — `node:fs`, a package — and reporting 1,066 of them would bury the few
  // that matter. So a specifier written as a path (`./x`, `../y`) is project-shaped and its
  // failure to resolve is enumerated; a bare specifier is counted as external and not listed.
  const unresolved = [];
  let external = 0;
  let duplicateImports = 0;
  for (const [rel, m] of Object.entries(modules)) {
    const seen = new Set();
    for (const spec of m.raw_imports) {
      const target = resolve(rel, spec);
      if (!target) {
        if (/^[./]/.test(spec)) unresolved.push([rel, spec]); else external++;
        continue;
      }
      if (target === rel) continue;             // a self-import is not an edge and is not a miss
      if (seen.has(target)) { duplicateImports++; continue; }
      seen.add(target);
    }
    m.imports = [...seen];
  }
  const edges = typedEdges(modules);
  // B4. Co-edit weights come from history, so they move on a commit and not on an edit. Deriving
  // them costs ~270 ms warm against a ~60 ms rebuild, so the previous result is reused while HEAD
  // has not moved: bounded work done once per commit rather than once per turn. Recomputed
  // whenever HEAD differs, which is exactly when the weights can have changed.
  const at = coeditHead(root);
  edges['co-edit'] = reusableCoedit(cfg, at) ?? coedit(root, new Set(Object.keys(modules)));
  return {
    fingerprint: only ? null : fingerprint(cfg), version: GRAPH_VERSION, head: at,
    built_at: new Date().toISOString(), root, modules, edges,
    audit: { unresolved, external, ambiguous: ambiguousSymbols(modules), duplicates: { import: duplicateImports, call: edges.duplicate_calls } },
  };
}

// The stored index read for one field only, ignoring its fingerprint. `load()` deliberately
// refuses a graph whose fingerprint has moved — that is what makes a stale index a miss — but a
// rebuild is exactly the case where the fingerprint HAS moved, and the co-edit weights are still
// good whenever HEAD has not. Reading the raw file here keeps that reuse without weakening
// `load()`.
function reusableCoedit(cfg, at) {
  if (!at || !cfg.layout?.graph) return null;
  try {
    const raw = JSON.parse(readFileSync(cfg.layout.graph, 'utf8'));
    return raw.version === GRAPH_VERSION && raw.head === at && raw.edges?.['co-edit'] ? raw.edges['co-edit'] : null;
  } catch { return null; }
}

// B2. A bare name defined in more than one module is why a careless lookup lands in the wrong
// place — `format` in `evals/fixtures/retrieval-app` is the recorded instance. Reported here so
// the ambiguity is visible before anchoring resolves it, and so a rise in it is visible after.
function ambiguousSymbols(modules) {
  const where = new Map();
  for (const [rel, m] of Object.entries(modules)) {
    for (const s of m.symbols) {
      if (!where.has(s.name)) where.set(s.name, new Set());
      where.get(s.name).add(rel);
    }
  }
  return [...where.entries()]
    .filter(([, mods]) => mods.size > 1)
    .map(([name, mods]) => [name, [...mods].sort()])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

// B1. The edges were already here and already implicit: file -> file inside `imports`,
// function -> function inside each symbol's `candidates`. Nothing could ask for one kind and get
// only that kind, and a third kind had nowhere to live.
//
// Emitted additively — `raw_imports` and `symbols` keep their meaning and every existing consumer
// keeps reading them.
//
// Stored grouped by source module rather than as flat per-edge records. This repository has 481
// import and 3,228 call edges, and a module path repeated once per edge costs more than every
// other field combined: flat `{type,from,to}` objects took the on-disk index from 349 KB to well
// over 900 KB, and flat tuples still reached 678 KB, for a file every hook parses. Grouped, the
// path is written once. `query(g, 'edges', ...)` materialises the per-edge objects.
function typedEdges(modules) {
  const names = new Set();
  for (const m of Object.values(modules)) for (const s of m.symbols) names.add(s.name);
  const imports = {};
  const calls = {};
  let duplicate_calls = 0;
  for (const [rel, m] of Object.entries(modules)) {
    if (m.imports.length) imports[rel] = m.imports;
    const out = [];
    const seen = new Set();
    for (const s of m.symbols) {
      // The same filter Q2 applies: an unknown name is a builtin or a method, not an edge. Two
      // filters that must agree is the shape of most defects in this repository, so there is one.
      for (const c of s.candidates) {
        if (!names.has(c) || c === s.name) continue;
        // B2. Each edge appears once. A name called twice in one body is one edge, and two
        // symbols of the same name in one module would otherwise emit it twice.
        const key = `${s.name} ${c}`;
        if (seen.has(key)) { duplicate_calls++; continue; }
        seen.add(key);
        out.push([s.name, c]);
      }
    }
    if (out.length) calls[rel] = out;
  }
  return { import: imports, call: calls, 'co-edit': {}, duplicate_calls };
}

function symbolTable(g) {
  const t = new Map();
  for (const [rel, m] of Object.entries(g.modules)) {
    for (const s of m.symbols) {
      if (!t.has(s.name)) t.set(s.name, []);
      t.get(s.name).push({ ...s, module: rel });
    }
  }
  return t;
}

// ---------------------------------------------------------------- the five questions
export function query(g, question, arg, opts = {}) {
  const table = symbolTable(g);
  switch (question) {
    // Q1
    case 'callers': {
      const defs = table.get(arg) ?? [];
      if (!defs.length) return [];
      const defModules = new Set(defs.map((d) => d.module));
      const out = [];
      for (const [rel, m] of Object.entries(g.modules)) {
        const visible = defModules.has(rel) || m.imports.some((i) => defModules.has(i));
        if (!visible) continue;
        for (const s of m.symbols) {
          if (s.candidates.includes(arg)) out.push({ id: `${rel}:${s.name}`, module: rel, symbol: s.name, start: s.start, end: s.end });
        }
      }
      return out;
    }
    // Q2 — candidates filtered against the known symbol table, which is what keeps the
    // heuristic honest: an unknown name is a builtin or a method, not an edge.
    case 'calls': {
      const defs = table.get(arg) ?? [];
      const out = new Set();
      for (const d of defs) for (const c of d.candidates) if (table.has(c) && c !== arg) out.add(c);
      return [...out];
    }
    // Q3 — B5. Centrality lives in rank.mjs; this is the same question with a better answer.
    case 'hubs': return hubs(g, opts);
    // Q9 — B5. The historical ranking, reported separately and never blended with the structural
    // one. Empty where there is no history.
    case 'co-edit-hubs': return coeditHubs(g, opts);
    // Q4 — Tarjan, components of size >= 2.
    case 'cycles': return tarjan(g).filter((c) => c.length > 1).map((c) => c.sort());
    // Q5
    case 'changed-since': return changedSymbols(g, arg ?? 'HEAD', opts.root ?? g.root);
    // Q8 — B3, anchor. Which definition does THIS call site reach?
    //
    // why: symbols are keyed by bare name, so `format` — exported by two modules in
    // `evals/fixtures/retrieval-app` — came back as two equal candidates and a careless lookup
    // took the first. Resolution uses the resolved `import` edges already computed: a definition
    // in the calling module wins, then a definition in exactly one module it imports. Where
    // neither decides, the answer says so and returns the candidates rather than picking one.
    // No type inference and no new parser; this is the smallest rule that fixes the defect.
    case 'definition': {
      const candidates = (table.get(arg) ?? []).map((d) => d.module);
      const unique = [...new Set(candidates)];
      const ambiguous = unique.length > 1;
      if (!unique.length) return { name: arg, resolved: null, ambiguous: false, candidates: [] };
      if (unique.length === 1) return { name: arg, resolved: unique[0], ambiguous: false, candidates: unique };
      const from = opts.from;
      if (from && unique.includes(from)) return { name: arg, resolved: from, ambiguous, candidates: unique };
      const imports = from ? (g.modules[from]?.imports ?? []) : [];
      const reachable = unique.filter((m) => imports.includes(m));
      return { name: arg, resolved: reachable.length === 1 ? reachable[0] : null, ambiguous, candidates: unique };
    }
    // Q6 — B1. One edge type in, only that type out, and every edge says which type produced it.
    // An unknown type throws rather than returning [], because a silent empty answer to a
    // misspelled question is indistinguishable from a true one.
    case 'edges': {
      if (!EDGE_TYPES.includes(arg)) throw new Error(`unknown edge type "${arg}" — known: ${EDGE_TYPES.join(', ')}`);
      const raw = g.edges?.[arg] ?? {};
      const out = [];
      if (arg === 'import') {
        for (const [from, tos] of Object.entries(raw)) for (const to of tos) out.push({ type: 'import', from, to });
      } else if (arg === 'call') {
        for (const [module, pairs] of Object.entries(raw)) for (const [symbol, to] of pairs) out.push({ type: 'call', from: { module, symbol }, to });
      } else {
        for (const [from, pairs] of Object.entries(raw)) for (const [to, weight] of pairs) out.push({ type: 'co-edit', from, to, weight });
      }
      return out;
    }
    // Q7 — B2. What the build could not do, as counts and as the list behind them. A reader can
    // see the unresolved share move without rebuilding, which is the point of storing it.
    case 'audit': {
      const a = g.audit ?? { unresolved: [], external: 0, ambiguous: [], duplicates: { import: 0, call: 0 } };
      return {
        counts: {
          unresolved: a.unresolved.length, external: a.external,
          ambiguous: a.ambiguous.length,
          duplicates_collapsed: (a.duplicates?.import ?? 0) + (a.duplicates?.call ?? 0),
        },
        unresolved: a.unresolved.map(([module, specifier]) => ({ module, specifier })),
        ambiguous: a.ambiguous.map(([name, modules]) => ({ name, modules })),
        duplicates: a.duplicates ?? { import: 0, call: 0 },
      };
    }
    default: throw new Error(`unknown graph question "${question}" — known: callers, calls, hubs, co-edit-hubs, cycles, changed-since, edges, audit, definition`);
  }
}

function tarjan(g) {
  const index = new Map(); const low = new Map(); const onStack = new Set();
  const stack = []; const out = []; let counter = 0;
  const strong = (v) => {
    index.set(v, counter); low.set(v, counter); counter++;
    stack.push(v); onStack.add(v);
    for (const w of g.modules[v]?.imports ?? []) {
      if (!g.modules[w]) continue;
      if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  };
  for (const v of Object.keys(g.modules)) if (!index.has(v)) strong(v);
  return out;
}

function changedSymbols(g, ref, root) {
  let diff;
  try { diff = execFileSync('git', ['diff', '--unified=0', ref], { cwd: root, encoding: 'utf8', maxBuffer: 32e6 }); }
  catch { return []; }
  const out = [];
  let file = null;
  for (const line of diff.split('\n')) {
    const f = line.match(/^\+\+\+ b\/(.+)$/);
    if (f) { file = f[1]; continue; }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!h || !file || !g.modules[file]) continue;
    const start = Number(h[1]);
    const end = start + (h[2] === undefined ? 1 : Number(h[2])) - 1;
    for (const s of g.modules[file].symbols) {
      if (s.start <= end && s.end >= start && !out.some((o) => o.module === file && o.symbol === s.name)) {
        out.push({ module: file, symbol: s.name, kind: s.kind, start: s.start, end: s.end });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- persistence
export function save(cfg, g) {
  mkdirSync(path.dirname(cfg.layout.graph), { recursive: true });
  writeFileSync(cfg.layout.graph, JSON.stringify(g));
  return cfg.layout.graph;
}

export function load(cfg) {
  if (!existsSync(cfg.layout.graph)) return null;
  try {
    const g = JSON.parse(readFileSync(cfg.layout.graph, 'utf8'));
    return g.version === GRAPH_VERSION && g.fingerprint === fingerprint(cfg) ? g : null;
  } catch { return null; }
}

// A cold clone has no graph. v6 returned quietly here and the graph only ever advanced on the
// one machine where someone had run the builder by hand.
export function ensure(cfg) {
  const existing = load(cfg);
  if (existing) return existing;
  const g = build(cfg);
  save(cfg, g);
  return g;
}

// Content and path identity catch shell writes, deletions, renames and branch switches,
// including same-size writes with preserved mtimes. No dependence on edit-hook delivery.
export function fingerprint(cfg) {
  const hash = createHash('sha256');
  for (const rel of discover(cfg)) {
    hash.update(rel).update('\0').update(readFileSync(path.join(cfg.layout.root, rel))).update('\0');
  }
  // the-index-tracks-the-source B2. The commit id, so history counts as part of the index's
  // identity.
  //
  // why: co-edit weights are derived from history, and a commit changes them while touching no
  // working-tree file. Under a paths-and-contents fingerprint the hash was identical across such
  // a commit, `refresh()` returned `{ skipped: 'clean' }`, and the co-edit edges rotted with
  // nothing in the loop able to see it. Deriving those weights is then bounded work done once per
  // commit rather than once per turn.
  //
  // Degrades to an empty component where there is no git, no commit, or a shallow clone, so the
  // fingerprint never throws where it previously returned.
  hash.update('\0').update(coeditHead(cfg.layout.root));
  return hash.digest('hex');
}

