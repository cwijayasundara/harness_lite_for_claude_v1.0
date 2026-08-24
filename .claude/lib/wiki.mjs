// Deterministic, LLM-free, rendered from the graph, gitignored.
//
// Per-cluster markdown pages an agent can read one at a time. Not a 380KB HTML browser
// committed to git and re-diffed on a tenth of all commits — v6 paid that toll for a viewer
// no agent ever opened.

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { query } from './graph.mjs';

const clusterOf = (module) => {
  const parts = module.split('/');
  return parts.length === 1 ? '(root)' : parts.slice(0, parts[0].startsWith('.') || parts.length > 2 ? 2 : 1).join('/');
};

export function renderWiki(cfg, g, { stale = null } = {}) {
  const dir = path.join(cfg.layout.state, 'wiki');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const clusters = new Map();
  for (const rel of Object.keys(g.modules)) {
    const c = clusterOf(rel);
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c).push(rel);
  }

  const banner = stale ? [`> **STALE since ${stale}** — the last refresh failed. Verify anything load-bearing against the source.`, ''] : [];
  const slug = (c) => c.replace(/[^\w.-]+/g, '_');

  const hubs = query(g, 'hubs', null, { limit: 15 });
  const cycles = query(g, 'cycles');
  const index = [
    ...banner,
    '# Codebase map',
    '',
    `Rendered from the graph — no model involved, no tokens spent. ${Object.keys(g.modules).length} modules in ${clusters.size} clusters.`,
    '',
    '## Hubs (most depended upon, excluding test callers)',
    '',
    '| module | fan-in | fan-out |',
    '|---|---:|---:|',
    ...hubs.map((h) => `| \`${h.module}\` | ${h.fan_in} | ${h.fan_out} |`),
    '',
  ];
  if (cycles.length) {
    index.push('## Import cycles', '', ...cycles.map((c) => `- ${c.map((m) => `\`${m}\``).join(' <-> ')}`), '');
  }
  index.push('## Clusters', '', ...[...clusters.keys()].sort().map((c) => `- [\`${c}\`](./${slug(c)}.md) — ${clusters.get(c).length} modules`));
  writeFileSync(path.join(dir, 'INDEX.md'), index.join('\n') + '\n');

  for (const [c, mods] of clusters) {
    const page = [...banner, `# ${c}`, '', `${mods.length} modules. [back to index](./INDEX.md)`, ''];
    for (const rel of mods.sort()) {
      const m = g.modules[rel];
      page.push(`## \`${rel}\``, '');
      if (m.imports.length) page.push(`imports: ${m.imports.map((i) => `\`${i}\``).join(', ')}`, '');
      if (m.symbols.length) {
        page.push('| symbol | kind | lines |', '|---|---|---|',
          ...m.symbols.map((s) => `| \`${s.name}\` | ${s.kind} | ${s.start}-${s.end} |`), '');
      }
    }
    writeFileSync(path.join(dir, `${slug(c)}.md`), page.join('\n') + '\n');
  }
  return { dir, pages: clusters.size + 1 };
}
