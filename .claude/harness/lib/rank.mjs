// How central is a module, structurally and historically.
//
// why: `query(g, 'hubs')` summed fan-in and fan-out, and graph.mjs said so in its own source — a
// naive hub metric "is how a graph looks useful while telling you nothing". Degree cannot tell a
// file imported once by the entry point from one imported ten times by leaves.
//
// Here rather than in graph.mjs because that module's stated 550-line ceiling was reached at the
// co-edit stage, and the decision was to split the concern rather than raise the number.
// Centrality moved whole, so the degree counts it still reports come from here too.

const DAMPING = 0.85;
const TOLERANCE = 1e-7;
const MAX_ITERATIONS = 100;

// Test modules do not confer hub status: v6's wiki ranked test/helpers/ as its top two hubs.
export const isTestModule = (m) =>
  /(^|\/)(tests?|__tests__)\//.test(m) || /(^|\/)(test_[^/]+|[^/]+[._](test|spec)\.[a-z]+)$/.test(m);

// Weighted power iteration. Dangling mass is redistributed uniformly so rank is conserved rather
// than leaking out of the sink nodes a codebase is full of.
export function pagerank(nodes, edges, { damping = DAMPING } = {}) {
  const n = nodes.length;
  if (!n) return new Map();
  const idx = new Map(nodes.map((m, i) => [m, i]));
  const adj = Array.from({ length: n }, () => []);
  const out = new Float64Array(n);
  for (const [from, to, weight = 1] of edges) {
    const f = idx.get(from); const t = idx.get(to);
    if (f === undefined || t === undefined || f === t) continue;
    adj[f].push([t, weight]);
    out[f] += weight;
  }
  let rank = new Float64Array(n).fill(1 / n);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let dangling = 0;
    for (let j = 0; j < n; j++) if (!out[j]) dangling += rank[j];
    const next = new Float64Array(n).fill((1 - damping) / n + (damping * dangling) / n);
    for (let j = 0; j < n; j++) {
      if (!out[j]) continue;
      const share = (damping * rank[j]) / out[j];
      for (const [t, w] of adj[j]) next[t] += share * w;
    }
    let delta = 0;
    for (let j = 0; j < n; j++) delta += Math.abs(next[j] - rank[j]);
    rank = next;
    if (delta < TOLERANCE) break;
  }
  return new Map(nodes.map((m, i) => [m, rank[i]]));
}

// B5. Structural rank over `import` and `call`. fan_in and fan_out are still reported, because the
// map renders them and a rank with no legible unit beside it is hard to trust.
//
// A call edge lands on a module via the anchor rule — a definition in the calling module, else one
// in exactly one module it imports — so a rank and a `definition` answer cannot disagree about
// which module a call reaches.
export function hubs(g, { limit = 20 } = {}) {
  const modules = Object.keys(g.modules);
  const defs = new Map();
  for (const [rel, m] of Object.entries(g.modules)) {
    for (const s of m.symbols) defs.set(s.name, (defs.get(s.name) ?? new Set()).add(rel));
  }
  const target = (from, callee) => {
    const to = [...(defs.get(callee) ?? [])];
    if (to.length === 1) return to[0];
    if (to.includes(from)) return from;
    const reachable = to.filter((m) => g.modules[from]?.imports.includes(m));
    return reachable.length === 1 ? reachable[0] : null;
  };

  const edges = []; const fanIn = new Map(); const fanOut = new Map();
  for (const [rel, m] of Object.entries(g.modules)) {
    fanOut.set(rel, m.imports.length);
    if (isTestModule(rel)) continue;
    for (const to of m.imports) { edges.push([rel, to, 1]); fanIn.set(to, (fanIn.get(to) ?? 0) + 1); }
    for (const [, callee] of g.edges?.call?.[rel] ?? []) {
      const to = target(rel, callee);
      if (to) edges.push([rel, to, 1]);
    }
  }
  const rank = pagerank(modules, edges);
  return modules.filter((m) => (fanIn.get(m) ?? 0) > 0)
    .map((m) => ({ module: m, rank: rank.get(m) ?? 0, fan_in: fanIn.get(m) ?? 0, fan_out: fanOut.get(m) ?? 0 }))
    .sort((a, b) => b.rank - a.rank || a.module.localeCompare(b.module)).slice(0, limit);
}

// B5. The historical rank, over `co-edit` alone and never blended into the structural one:
// "central in the code" and "changes with everything" are different facts, and one number hides
// which you are looking at. Empty where there is no history, leaving the structural rank as it was.
export function coeditHubs(g, { limit = 20 } = {}) {
  const edges = [];
  for (const [from, pairs] of Object.entries(g.edges?.['co-edit'] ?? {})) {
    for (const [to, w] of pairs) { edges.push([from, to, w]); edges.push([to, from, w]); }
  }
  if (!edges.length) return [];
  const rank = pagerank(Object.keys(g.modules), edges);
  return [...new Set(edges.map(([a]) => a))].map((m) => ({ module: m, rank: rank.get(m) ?? 0 }))
    .sort((a, b) => b.rank - a.rank || a.module.localeCompare(b.module)).slice(0, limit);
}
