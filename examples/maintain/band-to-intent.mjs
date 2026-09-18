#!/usr/bin/env node
// The Maintain loop, as an example rather than a subsystem.
//
// The playbook asks for "a deterministic script that watches production and invokes Claude when a
// control band is breached". lean-v2 cut 3 deleted the harness's version of that — operations.mjs,
// incidents.mjs, band tiers, a staging rollback port and three workflows — because it was built
// against no production traffic and had produced no incident in the ledger. This is what the
// playbook actually requires, and it is fifty lines that a project owns.
//
// Read a bands document on stdin or from a file, and write an intent for the first breach:
//
//   node examples/maintain/band-to-intent.mjs bands.json
//   your-metric-command | node examples/maintain/band-to-intent.mjs
//
// { "bands": [ { "metric": "overdue_rate", "observed": 0.31, "mean": 0.12, "stdev": 0.04 } ] }
//
// Detection stays model-free: this decides, and only then does an agent read the intent it wrote.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

// G19. The intent this writes has to be approvable, or the loop only appears to close. Gate 1
// binds a source: the bands document is the evidence, and the revision it was observed against is
// what makes the binding mean something later. A bands file that is not committed has no revision,
// so the binding is recorded as unbound in prose rather than written as a half-declaration that
// would fail at the gate — G07's rule, applied at the edge that produces the intent.
function binding(file) {
  if (!file) return { source: null, revision: null, why: 'the bands document arrived on stdin, so there is nothing to bind to' };
  const rel = path.relative(process.cwd(), path.resolve(file));
  const git = (...args) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    if (git('status', '--porcelain', '--', rel)) return { source: rel, revision: null, why: `${rel} has uncommitted changes` };
    const revision = git('log', '-1', '--format=%H', '--', rel);
    if (!revision) return { source: rel, revision: null, why: `${rel} is not committed` };
    return { source: rel, revision, why: null };
  } catch { return { source: rel, revision: null, why: 'this directory is not a git repository' }; }
}

const sigma = ({ observed, mean, stdev, max }) =>
  Number.isFinite(max) ? (observed > max ? 3 : 0)
  : !Number.isFinite(stdev) || stdev === 0 ? 0
  : Math.floor(Math.abs(observed - mean) / stdev);

const source = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : readFileSync(0, 'utf8');
const bands = JSON.parse(source).bands ?? [];
const breach = bands.map((b) => ({ ...b, tier: sigma(b) })).filter((b) => b.tier >= 2)
  .sort((a, b) => b.tier - a.tier)[0];

if (!breach) { console.log('PASS  all control bands within range'); process.exit(0); }

// 1σ logs, 2σ diagnoses read-only, 3σ proposes a change. Only the last writes an intent, because
// an intent is a request for work and a single noisy sample is not one.
if (breach.tier === 2) { console.log(`WATCH  ${breach.metric} at 2σ — diagnose read-only, no intent written`); process.exit(0); }

const slug = `${breach.metric}-breach`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 63);
const dir = path.join('.claude/harness', 'artifacts', slug);
const file = path.join(dir, 'intent.md');
if (existsSync(file)) { console.log(`OPEN  ${file} already exists`); process.exit(0); }

mkdirSync(dir, { recursive: true });
const bound = binding(process.argv[2]);
writeFileSync(file, `---
status: draft
${bound.source && bound.revision ? `source: ${bound.source}\nsource_revision: ${bound.revision}\n` : ''}---
# Intent: ${slug}

- **Date:** ${new Date().toISOString().slice(0, 10)}
- **Source:** control band breach, ${breach.tier}σ${bound.source && bound.revision ? `, from \`${bound.source}\` at \`${bound.revision.slice(0, 12)}\`` : `, unbound (${bound.why})`}

## Problem

\`${breach.metric}\` observed at ${breach.observed}, against a mean of ${breach.mean ?? 'n/a'} and a
standard deviation of ${breach.stdev ?? 'n/a'}. That is ${breach.tier}σ outside the band.

## Proposed outcome

The metric is back inside its band, and the cause is named in a test.

## Open questions

- Is the band still the right band? A breach can mean the threshold is wrong.
`);
// The incident becomes a permanent eval in the same step that proposes the work, because the
// step after an incident is the one nobody comes back to. `harness new eval` writes the seed under
// `.claude/harness/evals/pending/`; promoting it into the suite stays a human's decision.
// The project's own shim, which is an executable and not a node script — running it with `node`
// is how the first attempt at this failed. `HARNESS_BIN` is the seam a test uses to point at the
// harness under test instead of the installed one.
const harnessBin = process.env.HARNESS_BIN ?? (existsSync('.claude/harness/bin/harness') ? '.claude/harness/bin/harness' : null);
let seed = null;
if (harnessBin) {
  const made = harnessBin.endsWith('.mjs') || process.env.HARNESS_BIN
    ? spawnSync(process.execPath, [harnessBin, 'new', 'eval', slug], { encoding: 'utf8' })
    : spawnSync(harnessBin, ['new', 'eval', slug], { encoding: 'utf8' });
  if (made.status === 0) seed = made.stdout.trim();
  else console.error(`could not seed the regression eval: ${(made.stderr || made.stdout || '').trim() || made.status}`);
}

console.log(`BREACH  ${breach.metric} at ${breach.tier}σ\n${file}`
  + (bound.revision ? `\n  bound to ${bound.source} at ${bound.revision.slice(0, 12)}` : `\n  UNBOUND: ${bound.why} — commit the bands document and re-run to bind the intent`)
  + (seed ? `\n  regression eval seeded: ${seed}` : ''));
