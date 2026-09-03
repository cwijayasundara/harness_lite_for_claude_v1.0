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
import path from 'node:path';

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
const dir = path.join('.aidlc', 'artifacts', 'intent');
const file = path.join(dir, `${slug}.md`);
if (existsSync(file)) { console.log(`OPEN  ${file} already exists`); process.exit(0); }

mkdirSync(dir, { recursive: true });
writeFileSync(file, `# Intent: ${slug}

- **Date:** ${new Date().toISOString().slice(0, 10)}
- **Status:** draft
- **Source:** control band breach, ${breach.tier}σ

## Problem

\`${breach.metric}\` observed at ${breach.observed}, against a mean of ${breach.mean ?? 'n/a'} and a
standard deviation of ${breach.stdev ?? 'n/a'}. That is ${breach.tier}σ outside the band.

## Proposed outcome

The metric is back inside its band, and the cause is named in a test.

## Open questions

- Is the band still the right band? A breach can mean the threshold is wrong.
`);
console.log(`BREACH  ${breach.metric} at ${breach.tier}σ\n${file}`);
