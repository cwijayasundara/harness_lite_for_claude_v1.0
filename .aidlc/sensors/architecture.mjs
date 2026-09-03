// Repository-specific dependency boundary.
//
// Two rules, both structural, both cheap.
//
// 1. The neutral kernel may never import a provider projection. The old version checked only for
//    `adapters/`, a directory that never existed under that name — so while `lib/work-items.mjs`
//    imported `providers/jira.mjs` and `lib/operations.mjs` imported `providers/docker-compose.mjs`,
//    the sensor reported clean for 78 runs. A rule the docs claim and the sensor does not check is
//    worse than no rule: it is a claim with evidence-shaped decoration attached. lean-v2 cuts 1
//    through 5 removed every provider; this makes their return visible on the first commit.
//
// 2. Layer order. Each module may import only from layers below it. This is the OpenAI harness
//    pattern — a declared dependency direction validated by a structural test — and it is the
//    cheapest sensor in the tree at about thirty milliseconds.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

function files(dir) {
  if (!existsSync(dir)) return [];
  if (!statSync(dir).isDirectory()) return [dir];
  return readdirSync(dir).flatMap((name) => files(path.join(dir, name)));
}

// Lowest first. A module may import its own layer and anything below it, never above.
const LAYERS = [
  ['toml', 'paths', 'normalize'],
  ['config', 'ledger'],
  ['graph', 'pack', 'contract'],
  ['runner', 'guard', 'baseline', 'refresh', 'eval-gate', 'projection'],
];
const layerOf = new Map(LAYERS.flatMap((names, i) => names.map((name) => [name, i])));

const root = process.cwd();
const kernel = ['lib', 'checks', 'hooks', 'sensors'].map((name) => path.join(root, '.aidlc', name)).flatMap(files).filter((f) => f.endsWith('.mjs'));
const offenders = [];

for (const file of kernel) {
  const body = readFileSync(file, 'utf8');
  const rel = path.relative(root, file);

  for (const [, dir] of body.matchAll(/(?:from\s+|import\s*\()['"](?:\.\.\/|\.\/)*(adapters|providers)\//g)) {
    offenders.push(`${rel} imports a ${dir === 'providers' ? 'provider' : 'coding-agent'} projection`);
  }

  const from = layerOf.get(path.basename(file, '.mjs'));
  if (from === undefined) continue;
  for (const [, name] of body.matchAll(/(?:from\s+|import\s*\()['"]\.\/([a-z-]+)\.mjs['"]/g)) {
    const to = layerOf.get(name);
    if (to !== undefined && to > from) offenders.push(`${rel} (layer ${from}) imports ${name} (layer ${to}) — dependencies point down`);
  }
}

if (offenders.length) {
  for (const line of offenders) console.error(`architecture: ${line}`);
  process.exit(1);
}
