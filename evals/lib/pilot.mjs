// Prospective, dependency-free analysis for the thin-core controlled pilot. Assignment is
// deterministic from a committed seed and declared strata; outcomes remain in the existing
// append-only productivity-event interchange.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEvents } from '../../.claude/harness/lib/productivity.mjs';

export const REGISTRATION_SCHEMA = 'harness.controlled-pilot/v1';
export const ANALYSIS_SCHEMA = 'harness.controlled-pilot-analysis/v1';
export const ARMS = ['native', 'harness'];
export const MIN_PER_ARM = 20;
const TERMINAL_RESULTS = new Set(['cancelled', 'abandoned', 'timed-out']);

const finite = (value) => Number.isFinite(value);
const round = (value, digits = 4) => value === null ? null : Number(value.toFixed(digits));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const variance = (values) => values.length > 1
  ? values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / (values.length - 1) : null;
const ciDifference = (left, right) => {
  if (left.length < 2 || right.length < 2) return { value: null, low: null, high: null, why: 'each arm needs at least two observations' };
  const value = mean(left) - mean(right);
  const se = Math.sqrt(variance(left) / left.length + variance(right) / right.length);
  return { value: round(value), low: round(value - 1.96 * se), high: round(value + 1.96 * se), confidence: 0.95 };
};

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty text`);
}

export function validateRegistration(registration, { requireAssignments = false } = {}) {
  if (!registration || typeof registration !== 'object' || Array.isArray(registration)) throw new Error('pilot registration must be an object');
  if (registration.schema !== REGISTRATION_SCHEMA) throw new Error(`schema must be ${REGISTRATION_SCHEMA}`);
  requireText(registration.id, 'id');
  requireText(registration.registered_at, 'registered_at');
  if (!finite(Date.parse(registration.registered_at))) throw new Error('registered_at must be an ISO-compatible timestamp');
  requireText(registration.seed, 'seed');
  for (const field of ['hypotheses', 'inclusion_rules', 'primary_outcomes', 'decision_rule', 'limitations']) {
    if (!Array.isArray(registration[field]) || !registration[field].length) throw new Error(`${field} must be a non-empty array`);
    registration[field].forEach((value, index) => requireText(value, `${field}[${index}]`));
  }
  if (!Array.isArray(registration.units) || registration.units.length < MIN_PER_ARM * 2) throw new Error(`units must contain at least ${MIN_PER_ARM * 2} eligible changes`);
  const ids = new Set();
  for (const [index, unit] of registration.units.entries()) {
    for (const field of ['change', 'repository', 'task_type', 'risk', 'experience', 'model', 'model_version', 'ci_profile']) requireText(unit?.[field], `units[${index}].${field}`);
    if (ids.has(unit.change)) throw new Error(`duplicate change: ${unit.change}`);
    ids.add(unit.change);
    if (requireAssignments && !ARMS.includes(unit.arm)) throw new Error(`units[${index}].arm must be native or harness`);
  }
  return registration;
}

const stratum = (unit) => [unit.repository, unit.task_type, unit.risk, unit.experience].join('\u001f');
const score = (seed, change) => createHash('sha256').update(`${seed}\u0000${change}`).digest('hex');

export function assign(registration) {
  validateRegistration(registration);
  const groups = new Map();
  for (const unit of registration.units) {
    const key = stratum(unit);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...unit });
  }
  const assigned = [];
  for (const [key, units] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    units.sort((a, b) => score(registration.seed, a.change).localeCompare(score(registration.seed, b.change)));
    const first = parseInt(score(registration.seed, key).slice(0, 2), 16) % 2;
    units.forEach((unit, index) => assigned.push({ ...unit, arm: ARMS[(index + first) % 2] }));
  }
  // Odd strata can accumulate an avoidable global imbalance. Move only surplus units from odd
  // strata, retaining the best possible within-stratum difference (one).
  const counts = () => Object.fromEntries(ARMS.map((arm) => [arm, assigned.filter((unit) => unit.arm === arm).length]));
  let totals = counts();
  while (Math.abs(totals.native - totals.harness) > 1) {
    const surplus = totals.native > totals.harness ? 'native' : 'harness';
    const target = surplus === 'native' ? 'harness' : 'native';
    const candidate = assigned.find((unit) => unit.arm === surplus && assigned.filter((other) => stratum(other) === stratum(unit)).length % 2 === 1);
    if (!candidate) break;
    candidate.arm = target;
    totals = counts();
  }
  assigned.sort((a, b) => a.change.localeCompare(b.change));
  return { ...registration, assigned_at: new Date().toISOString(), units: assigned };
}

function changeOutcome(unit, events) {
  const rows = events.filter((event) => event.change === unit.change);
  const healthy = rows.find((event) => event.stage === 'deploy' && event.event === 'healthy' && event.result === 'pass');
  const failed = rows.find((event) => event.stage === 'deploy' && ['fail', 'rolled-back'].includes(event.result));
  const unsuccessful = rows.find((event) => TERMINAL_RESULTS.has(event.result)
    || event.failure === 'budget-exhausted' || event.repair_cause === 'budget-exhausted');
  const terminal = healthy ?? failed ?? unsuccessful ?? null;
  const started = rows.map((event) => Date.parse(event.at)).filter(finite).sort((a, b) => a - b)[0];
  const lead = healthy && finite(started) ? (Date.parse(healthy.at) - started) / 3_600_000 : null;
  const human = rows.filter((event) => event.actor_type === 'human').map((event) => event.active_minutes).filter(finite);
  const costs = rows.map((event) => event.cost_usd).filter(finite);
  const ci = rows.filter((event) => event.stage === 'ci' && event.first_pass !== undefined).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  const reviewMinutes = rows.filter((event) => event.stage === 'review' && event.actor_type === 'human').map((event) => event.active_minutes).filter(finite);
  return {
    change: unit.change, arm: unit.arm, stratum: stratum(unit), terminal: Boolean(terminal),
    status: healthy ? 'accepted' : failed ? 'failed'
      : unsuccessful && (unsuccessful.failure === 'budget-exhausted' || unsuccessful.repair_cause === 'budget-exhausted')
        ? 'budget-exhausted' : unsuccessful?.result ?? 'incomplete',
    quality_score: healthy ? 1 : failed ? -1 : 0,
    human_minutes: human.length ? human.reduce((a, b) => a + b, 0) : null,
    review_minutes: reviewMinutes.length ? reviewMinutes.reduce((a, b) => a + b, 0) : null,
    lead_hours: lead, cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    first_pass_ci: ci ? ci.result === 'pass' : null,
  };
}

const values = (rows, key, predicate = () => true) => rows.filter(predicate).map((row) => row[key]).filter(finite);
const armSummary = (rows) => {
  const terminal = rows.filter((row) => row.terminal);
  const accepted = rows.filter((row) => row.status === 'accepted');
  const failed = rows.filter((row) => row.status === 'failed');
  const firstPass = rows.map((row) => row.first_pass_ci).filter((value) => value !== null);
  const totalCost = values(rows, 'cost_usd').reduce((a, b) => a + b, 0);
  return {
    assigned: rows.length, terminal: terminal.length, accepted: accepted.length, failed: failed.length,
    unsuccessful: terminal.length - accepted.length - failed.length, incomplete: rows.length - terminal.length,
    human_minutes_per_accepted: accepted.length && values(rows, 'human_minutes').length === rows.length ? round(values(rows, 'human_minutes').reduce((a, b) => a + b, 0) / accepted.length) : null,
    lead_hours_to_healthy: { mean: round(mean(values(accepted, 'lead_hours'))), of: values(accepted, 'lead_hours').length },
    first_pass_ci: { value: firstPass.length ? round(firstPass.filter(Boolean).length / firstPass.length) : null, of: firstPass.length },
    review_minutes: { mean: round(mean(values(rows, 'review_minutes'))), of: values(rows, 'review_minutes').length },
    change_failure_rate: { value: accepted.length + failed.length ? round(failed.length / (accepted.length + failed.length)) : null, of: accepted.length + failed.length },
    quality_adjusted_throughput: { value: rows.length ? round(values(rows, 'quality_score').reduce((a, b) => a + b, 0) / rows.length) : null, of: rows.length },
    total_cost_usd: values(rows, 'cost_usd').length === rows.length ? round(totalCost) : null,
    cost_per_accepted_change: accepted.length && values(rows, 'cost_usd').length === rows.length ? round(totalCost / accepted.length) : null,
  };
};

export function analyze(registration, events) {
  validateRegistration(registration, { requireAssignments: true });
  const outcomes = registration.units.map((unit) => changeOutcome(unit, events));
  const byArm = Object.fromEntries(ARMS.map((arm) => [arm, outcomes.filter((row) => row.arm === arm)]));
  const summaries = Object.fromEntries(ARMS.map((arm) => [arm, armSummary(byArm[arm])]));
  const mismatches = [];
  for (const unit of registration.units) {
    const rows = events.filter((event) => event.change === unit.change);
    for (const field of ['model', 'model_version']) {
      const observed = [...new Set(rows.map((event) => event[field]).filter(Boolean))];
      if (observed.some((value) => value !== unit[field])) mismatches.push({ change: unit.change, field, expected: unit[field], observed });
    }
    const ciProfiles = [...new Set(rows.filter((event) => event.stage === 'ci').map((event) => event.environment).filter(Boolean))];
    if (ciProfiles.some((value) => value !== unit.ci_profile)) mismatches.push({ change: unit.change, field: 'ci_profile', expected: unit.ci_profile, observed: ciProfiles });
  }
  const comparisons = {
    quality_adjusted_throughput: ciDifference(values(byArm.harness, 'quality_score'), values(byArm.native, 'quality_score')),
    human_minutes_accepted: ciDifference(values(byArm.harness, 'human_minutes', (row) => row.status === 'accepted'), values(byArm.native, 'human_minutes', (row) => row.status === 'accepted')),
    lead_hours_healthy: ciDifference(values(byArm.harness, 'lead_hours', (row) => row.status === 'accepted'), values(byArm.native, 'lead_hours', (row) => row.status === 'accepted')),
    change_failure: ciDifference(byArm.harness.filter((row) => ['accepted', 'failed'].includes(row.status)).map((row) => row.status === 'failed' ? 1 : 0), byArm.native.filter((row) => ['accepted', 'failed'].includes(row.status)).map((row) => row.status === 'failed' ? 1 : 0)),
    cost_per_accepted_change: {
      value: summaries.harness.cost_per_accepted_change === null || summaries.native.cost_per_accepted_change === null
        ? null : round(summaries.harness.cost_per_accepted_change - summaries.native.cost_per_accepted_change),
      low: null, high: null, method: 'raw all-attempt cost divided by accepted changes',
    },
  };
  const limitations = [...registration.limitations];
  const powered = ARMS.every((arm) => summaries[arm].terminal >= MIN_PER_ARM);
  if (!powered) limitations.push(`directional decision requires ${MIN_PER_ARM} terminal changes per arm`);
  if (mismatches.length) limitations.push('model/version or CI differed from the registered comparison block');
  const measured = Object.values(comparisons).every((comparison) => comparison.value !== null);
  if (!measured) limitations.push('one or more primary/guardrail comparisons lacks measured observations');
  const gain = powered && !mismatches.length && measured
    && comparisons.quality_adjusted_throughput.low >= 0
    && (comparisons.human_minutes_accepted.high < 0 || comparisons.quality_adjusted_throughput.low > 0)
    && comparisons.change_failure.high <= 0.05
    && comparisons.cost_per_accepted_change.value <= 0;
  return {
    schema: ANALYSIS_SCHEMA, registration: registration.id, analyzed_at: new Date().toISOString(),
    raw_counts: summaries, comparisons, mismatches, limitations,
    decision: gain ? 'advance' : powered && measured && !mismatches.length ? 'revise-or-remove' : 'insufficient-evidence',
    decision_basis: 'advance only when the 95% interval shows lower human effort or higher quality-adjusted throughput, with no material (>5 percentage point) change-failure increase or cost increase',
    outcomes,
  };
}

export function readRegistration(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  validateRegistration(parsed, { requireAssignments: parsed.units?.every((unit) => unit.arm) });
  return parsed;
}

export function readEvidence(file) { return parseEvents(readFileSync(file, 'utf8')); }
