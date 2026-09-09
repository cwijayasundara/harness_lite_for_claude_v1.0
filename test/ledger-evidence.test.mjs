// ledger-evidence-not-reporting: the ledger records what fired, how often, and how often a human
// called a fire wrong. It does not measure benefit, and it is not a place to publish from.
// The investigation this states the limit for is in
// .aidlc/artifacts/ledger-evidence-not-reporting/review.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import { KILL } from '../.aidlc/lib/ledger.mjs';

const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const LEDGER = read('.aidlc/lib/ledger.mjs');
const HARNESS = read('.aidlc/bin/harness');
const README = read('README.md');
const PLAN = read('docs/IMPROVEMENT-PLAN.md');

test('B1 the recorded investigation says what an unflagged block does not prove', () => {
  const row = PLAN.split('\n').find(line => line.startsWith('| Ledger and development evidence |'));
  assert.ok(row, 'the lean-review ledger row is missing');
  assert.match(row, /unflagged block is an uninvestigated one/,
    'the row must not let an unflagged block read as a true positive');
  assert.match(row, /local development history, not a product-benefit sample/);
  assert.match(row, /2026-09-09/, 'a snapshot without its date goes stale silently');
  assert.match(row, /ledger-evidence-not-reporting/, 'the row must name where the investigation lives');
});

test('B2 the guidance says what a fire rate and a seeded deterrent test each prove', () => {
  assert.match(README, /how busy a control is, not what it prevented/);
  assert.match(README, /a planted defect still reaches a control that never fires/);
  assert.match(README, /only an\s+`unreliable` control/);
  // The claim this replaced: the ledger has never decided that anything is useless.
  assert.doesNotMatch(README, /never useful get\s+deleted/);
});

test('B3 rows are appended, the flag preserves what the guard wrote, and nothing publishes', () => {
  assert.match(LEDGER, /appendFileSync\(L\.ledger/, 'rows are appended');
  // flag() is the one write to an existing row, and it only ever sets the field a human asked for.
  assert.match(LEDGER, /lines\[i\] = JSON\.stringify\(\{ \.\.\.row, false: value \}\)/,
    'the flag must add a field, never rewrite a verdict, rule, timestamp or run');
  const writes = [...LEDGER.matchAll(/writeFileSync\(L\.(\w+)/g)].map(m => m[1]).sort();
  assert.deepEqual([...new Set(writes)], ['ledger', 'runId'],
    'a new file written from the ledger library is a new evidence artifact');

  for (const service of [/truncate/i, /rotate/i, /\bprune/i, /createServer/, /\.listen\(/, /fetch\(/, /upload/i, /cron/i]) {
    assert.doesNotMatch(LEDGER, service, 'the ledger keeps its history and does not publish it');
  }

  // The whole `harness ledger` surface: a bare report, plus these three.
  const sub = [...HARNESS.matchAll(/argv\[1\] === '(\w+)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(sub)].sort(), ['audit', 'export', 'flag'],
    'a new ledger subcommand is the reporting service this row refuses');
  assert.match(HARNESS, /usage: harness ledger export --invocation <id>/,
    'export stays scoped to one invocation');
});

test('B4 no benefit, score or saving enters a row, a threshold or the audit result', () => {
  assert.deepEqual(Object.keys(KILL).sort(), ['max_error_rate', 'min_fire_rate', 'min_sessions'],
    'a new kill threshold is a new claim about what the ledger can judge');
  assert.deepEqual(KILL, { min_sessions: 50, min_fire_rate: 0.05, max_error_rate: 0.10 });

  const verdicts = [...LEDGER.matchAll(/'(unwired|insufficient-data|unreliable|never-fired|rarely-fires|earning-its-place|deterrent)'/g)];
  assert.ok(verdicts.length > 0, 'the verdict set moved out of the audit');
  const actions = LEDGER.match(/const action = \{[\s\S]*?\n {2}\};/);
  assert.ok(actions, 'the audit action map is missing');
  assert.deepEqual([...actions[0].matchAll(/^\s{4}'?([a-z-]+)'?:/gm)].map(m => m[1]).sort(), [
    'earning-its-place', 'insufficient-data', 'never-fired', 'rarely-fires', 'unreliable', 'unwired',
  ], 'a new verdict needs its own approved contract');

  // Deletion authority on the ledger's own evidence stays exactly one verdict wide.
  assert.match(LEDGER, /deletions: controls\.filter\(\(c\) => c\.verdict === 'unreliable'\)/);

  for (const metric of [/\bbenefit\b/i, /\bscore\b/i, /\bsaving/i, /\broi\b/i, /\bimpact\b/i, /net_value/i]) {
    assert.doesNotMatch(LEDGER, metric, 'the ledger counts fires; it does not price them');
  }
});
