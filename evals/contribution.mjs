#!/usr/bin/env node
// G21. What the harness contributed, from a run that measured both arms.
//
// `claude plugin eval --ablation with-without` runs every case twice: once with the plugin loaded
// and once without it. The difference is the only number in this repository that answers "does
// this harness make a model better at these tasks", rather than "does a capable model pass these
// tasks" — which is the question a single-arm suite has always silently answered instead.
//
// This reads that run's JSON and records the delta per case and in aggregate. It computes nothing
// the run did not measure: a case the run could not score is `null` here, never zero, because a
// missing measurement averaged in as zero is a claim nobody made.
//
//   node evals/contribution.mjs evals/evidence/plugin-eval.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EVIDENCE = path.join(HERE, 'evidence', 'contribution.json');

const score = (arm) => (Number.isFinite(arm?.score) ? arm.score : null);

// The shape is read defensively on purpose: this parses another tool's output, and a field that
// moved should produce "unmeasured" rather than a confident wrong number.
export function contribution(report) {
  const cases = [];
  for (const c of report?.cases ?? []) {
    const withPlugin = score(c.arms?.with ?? c.with ?? (c.ablation?.with));
    const without = score(c.arms?.without ?? c.without ?? (c.ablation?.without));
    const delta = withPlugin === null || without === null ? null : Number((withPlugin - without).toFixed(4));
    cases.push({ id: c.id ?? c.name ?? c.case ?? 'unknown', with: withPlugin, without, delta });
  }
  const measured = cases.filter((c) => c.delta !== null);
  return {
    kind: 'plugin-eval-contribution',
    at: new Date().toISOString(),
    cases,
    aggregates: {
      cases: cases.length,
      measured: measured.length,
      unmeasured: cases.length - measured.length,
      // Null rather than 0 when nothing was measured: an average of no numbers is not a number,
      // and a contribution of zero is a specific claim this would not have earned.
      meanDelta: measured.length
        ? Number((measured.reduce((n, c) => n + c.delta, 0) / measured.length).toFixed(4))
        : null,
      improved: measured.filter((c) => c.delta > 0).length,
      unchanged: measured.filter((c) => c.delta === 0).length,
      regressed: measured.filter((c) => c.delta < 0).length,
    },
  };
}

export function save(record, file = EVIDENCE) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  return file;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = process.argv[2];
  if (!source || !existsSync(source)) {
    console.error('usage: node evals/contribution.mjs <plugin-eval json>');
    process.exit(2);
  }
  const record = contribution(JSON.parse(readFileSync(source, 'utf8')));
  const file = save(record);
  const { meanDelta, measured, unmeasured, improved, regressed } = record.aggregates;
  console.log(`contribution: meanDelta ${meanDelta ?? 'unmeasured'} over ${measured} case(s)`
    + `${unmeasured ? `, ${unmeasured} unmeasured` : ''} — ${improved} improved, ${regressed} regressed`);
  console.log(path.relative(process.cwd(), file));
}
