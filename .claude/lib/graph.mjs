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
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const GRAPH_VERSION = 3;

const LANG_BY_EXT = {
  '.py': 'py', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
  '.ts': 'js', '.tsx': 'js', '.go': 'go', '.java': 'java', '.rs': 'rs',
};
const IS_TEST = /(^|\/)(tests?|__tests__)\//.test.bind(/(^|\/)(tests?|__tests__)\//) ;
const isTestModule = (m) => /(^|\/)(tests?|__tests__)\//.test(m) || /(^|\/)(test_[^/]+|[^/]+[._](test|spec)\.[a-z]+)$/.test(m);

const RESERVED = new Set([
  'if', 'for', 'while', 'return', 'print', 'len', 'str', 'int', 'float', 'dict', 'list', 'set',
  'tuple', 'bool', 'range', 'super', 'isinstance', 'type', 'open', 'sorted', 'enumerate', 'zip',
  'function', 'switch', 'catch', 'typeof', 'await', 'new', 'require', 'import', 'export',
  'constructor', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Promise', 'RegExp',
  'and', 'or', 'not', 'in', 'is', 'elif', 'else', 'try', 'except', 'with', 'assert', 'raise', 'lambda',
]);

// ---------------------------------------------------------------- file discovery
function walk(root, rel, exclude, out) {
  const abs = path.join(root, rel);
  let entries;
  try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (exclude.includes(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
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
  const files = only ?? discover(cfg);
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
  for (const [rel, m] of Object.entries(modules)) {
    m.imports = [...new Set(m.raw_imports.map((s) => resolve(rel, s)).filter((x) => x && x !== rel))];
  }
  return { version: GRAPH_VERSION, built_at: new Date().toISOString(), root, modules };
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
    // Q3 — test modules do not confer hub status. v6's committed wiki ranked test/helpers/
    // as its top two hubs, which is how a graph looks useful while telling you nothing.
    case 'hubs': {
      const fanIn = new Map();
      const fanOut = new Map();
      for (const [rel, m] of Object.entries(g.modules)) {
        fanOut.set(rel, m.imports.length);
        if (isTestModule(rel)) continue;
        for (const i of m.imports) fanIn.set(i, (fanIn.get(i) ?? 0) + 1);
      }
      return [...fanIn.entries()]
        .map(([module, fan_in]) => ({ module, fan_in, fan_out: fanOut.get(module) ?? 0 }))
        .sort((a, b) => b.fan_in - a.fan_in || a.module.localeCompare(b.module))
        .slice(0, opts.limit ?? 20);
    }
    // Q4 — Tarjan, components of size >= 2.
    case 'cycles': return tarjan(g).filter((c) => c.length > 1).map((c) => c.sort());
    // Q5
    case 'changed-since': return changedSymbols(g, arg ?? 'HEAD', opts.root ?? g.root);
    default: throw new Error(`unknown graph question "${question}" — known: callers, calls, hubs, cycles, changed-since`);
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
    return g.version === GRAPH_VERSION ? g : null;
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
