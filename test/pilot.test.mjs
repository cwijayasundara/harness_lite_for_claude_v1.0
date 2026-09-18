import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REGISTRATION_SCHEMA, assign, analyze, validateRegistration } from '../evals/lib/pilot.mjs';
import { SCHEMA } from '../.claude/harness/lib/productivity.mjs';

const registration = (count = 40) => ({
  schema: REGISTRATION_SCHEMA, id: 'pilot-1', registered_at: '2026-09-18T09:00:00Z', seed: 'public-seed',
  hypotheses: ['Harness improves effort or quality.'], inclusion_rules: ['Non-emergency product work.'],
  primary_outcomes: ['Human minutes', 'Quality-adjusted throughput'],
  decision_rule: ['Advance only with the registered confidence-interval rule.'],
  limitations: ['Directional sample.'],
  units: Array.from({ length: count }, (_, i) => ({
    change: `change-${String(i).padStart(2, '0')}`, repository: `repo-${i % 2}`,
    task_type: i % 2 ? 'feature' : 'defect', risk: i % 4 < 2 ? 'low' : 'medium',
    experience: i % 3 ? 'maintainer' : 'newcomer', model: 'claude-sonnet',
    model_version: '2026-09', ci_profile: 'github-prod',
  })),
});

const event = (unit, overrides = {}) => ({
  schema: SCHEMA, id: `${unit.change}-${overrides.stage ?? 'candidate'}-${overrides.event ?? 'completed'}`,
  change: unit.change, stage: 'candidate', event: 'completed', at: '2026-09-18T10:00:00Z',
  actor_type: 'agent', result: 'pass', model: unit.model, model_version: unit.model_version,
  cost_usd: unit.arm === 'harness' ? 1 : 2, ...overrides,
});

test('registration requires a prospective 40-change portfolio and declared outcomes', () => {
  assert.throws(() => validateRegistration(registration(39)), /at least 40/);
  assert.doesNotThrow(() => validateRegistration(registration()));
});

test('assignment is reproducible, stratified and globally balanced', () => {
  const first = assign(registration());
  const second = assign(registration());
  assert.deepEqual(first.units, second.units);
  const counts = first.units.reduce((out, unit) => ({ ...out, [unit.arm]: (out[unit.arm] ?? 0) + 1 }), {});
  assert.ok(Math.abs(counts.native - counts.harness) <= 1);
  for (const unit of first.units) assert.ok(['native', 'harness'].includes(unit.arm));
});

test('analysis preserves unsuccessful attempts and refuses an underpowered gain claim', () => {
  const assigned = assign(registration());
  const events = assigned.units.slice(0, 8).map((unit, i) => event(unit, i === 0
    ? { result: 'timed-out' } : i === 1 ? { result: 'unmeasured', failure: 'budget-exhausted' } : {}));
  const result = analyze(assigned, events);
  assert.equal(result.decision, 'insufficient-evidence');
  assert.equal(result.outcomes.find((row) => row.status === 'timed-out').terminal, true);
  assert.equal(result.outcomes.find((row) => row.status === 'budget-exhausted').terminal, true);
  assert.match(result.limitations.join(' '), /20 terminal changes per arm/);
});

test('a powered matched pilot publishes counts and confidence intervals without hiding failures', () => {
  const assigned = assign(registration());
  const events = [];
  for (const unit of assigned.units) {
    events.push(event(unit));
    events.push(event(unit, { id: `${unit.change}-human`, stage: 'review', actor_type: 'human',
      active_minutes: unit.arm === 'harness' ? 5 : 15, cost_usd: 0 }));
    events.push(event(unit, { id: `${unit.change}-ci`, stage: 'ci', candidate: unit.change,
      environment: unit.ci_profile, first_pass: true, cost_usd: 0 }));
    events.push(event(unit, { id: `${unit.change}-deploy`, stage: 'deploy', event: 'healthy',
      at: '2026-09-18T12:00:00Z', release: `r-${unit.change}`, environment: 'production',
      artifact: `artifact-${unit.change}`, cost_usd: 0 }));
  }
  const result = analyze(assigned, events);
  assert.equal(result.raw_counts.native.terminal + result.raw_counts.harness.terminal, 40);
  assert.equal(result.comparisons.human_minutes_accepted.high < 0, true);
  assert.equal(result.comparisons.cost_per_accepted_change.value < 0, true);
  assert.equal(result.decision, 'advance');
});

test('a model or CI mismatch invalidates the decision instead of being averaged away', () => {
  const assigned = assign(registration());
  const unit = assigned.units[0];
  const result = analyze(assigned, [event(unit, { model_version: 'changed-mid-block' })]);
  assert.equal(result.decision, 'insufficient-evidence');
  assert.equal(result.mismatches[0].field, 'model_version');
});

test('integration: the CLI assigns and analyzes a simple matched change portfolio end to end', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'controlled-pilot-'));
  try {
    const registrationFile = path.join(root, 'registration.json');
    const assignedFile = path.join(root, 'assigned.json');
    const eventsFile = path.join(root, 'events.jsonl');
    writeFileSync(registrationFile, JSON.stringify(registration()));

    const assignedRaw = execFileSync(process.execPath,
      ['evals/pilot.mjs', 'assign', '--registration', registrationFile], { encoding: 'utf8' });
    writeFileSync(assignedFile, assignedRaw);
    const assigned = JSON.parse(assignedRaw);

    // The deliberately small product story is the same in both arms: normalize and deploy one
    // slug change. Only the recorded effort/cost differs, making this a protocol integration test,
    // not evidence that the harness caused the fixture's numbers.
    const events = assigned.units.flatMap((unit) => [
      event(unit),
      event(unit, { id: `${unit.change}-human`, stage: 'review', actor_type: 'human',
        active_minutes: unit.arm === 'harness' ? 4 : 12, cost_usd: 0 }),
      event(unit, { id: `${unit.change}-ci`, stage: 'ci', candidate: unit.change,
        environment: unit.ci_profile, first_pass: true, cost_usd: 0 }),
      event(unit, { id: `${unit.change}-deploy`, stage: 'deploy', event: 'healthy',
        at: '2026-09-18T12:00:00Z', release: `slug-${unit.change}`,
        candidate: unit.change, environment: 'production',
        artifact: `slug-service@${unit.change}`, cost_usd: 0 }),
    ]);
    writeFileSync(eventsFile, events.map((row) => JSON.stringify(row)).join('\n') + '\n');

    const analysis = JSON.parse(execFileSync(process.execPath,
      ['evals/pilot.mjs', 'analyze', '--registration', assignedFile, '--events', eventsFile],
      { encoding: 'utf8' }));
    assert.equal(analysis.decision, 'advance');
    assert.equal(analysis.raw_counts.native.terminal, 20);
    assert.equal(analysis.raw_counts.harness.terminal, 20);
    assert.equal(analysis.outcomes.length, 40);
    assert.deepEqual(analysis.mismatches, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
