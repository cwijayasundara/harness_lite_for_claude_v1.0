// One deliberately small interchange format for evidence owned by Git hosts, CI/CD,
// observability and people. The harness validates and summarizes copies; it does not become
// another tracker, deployment engine or telemetry service.

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const SCHEMA = 'harness.productivity-event/v1';
export const STAGES = ['intent', 'spec', 'plan', 'candidate', 'pr', 'ci', 'review', 'deploy', 'incident'];
export const RESULTS = ['pass', 'fail', 'cancelled', 'abandoned', 'timed-out', 'rolled-back', 'unmeasured'];
export const ACTORS = ['human', 'agent', 'ci', 'system'];
export const EVENTS = ['started', 'created', 'accepted', 'opened', 'completed', 'finding', 'resolved',
  'merged', 'closed', 'deployed', 'healthy', 'rollback', 'breach', 'diagnosed', 'triaged'];
export const MIN_SAMPLE = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const text = (v, n = 300) => typeof v === 'string' && v.length > 0 && v.length <= n && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const optionalText = (v, n) => v === undefined || v === null || text(v, n);
const optionalNumber = (v) => v === undefined || v === null || Number.isFinite(v) && v >= 0;

export function validateEvent(event) {
  const errors = [];
  if (!event || typeof event !== 'object' || Array.isArray(event)) return ['event must be an object'];
  if (event.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  if (!text(event.id, 200)) errors.push('id must be 1-200 printable characters');
  if (!text(event.change, 200)) errors.push('change must be 1-200 printable characters');
  if (!STAGES.includes(event.stage)) errors.push(`stage must be one of: ${STAGES.join(', ')}`);
  if (!EVENTS.includes(event.event)) errors.push(`event must be one of: ${EVENTS.join(', ')}`);
  if (!Number.isFinite(Date.parse(event.at))) errors.push('at must be an ISO-compatible timestamp');
  if (!ACTORS.includes(event.actor_type)) errors.push(`actor_type must be one of: ${ACTORS.join(', ')}`);
  if (!RESULTS.includes(event.result)) errors.push(`result must be one of: ${RESULTS.join(', ')}`);
  for (const key of ['candidate', 'release', 'model', 'model_version', 'environment', 'resolver_type',
    'repair_cause', 'artifact', 'health', 'rollback', 'failure', 'recurrence_class', 'linked_intent', 'source']) {
    if (!optionalText(event[key], 500)) errors.push(`${key} must be printable text when present`);
  }
  for (const key of ['duration_ms', 'active_minutes', 'cost_usd', 'findings']) {
    if (!optionalNumber(event[key])) errors.push(`${key} must be a non-negative number when present`);
  }
  for (const key of ['first_pass', 'rerun']) if (event[key] !== undefined && typeof event[key] !== 'boolean') errors.push(`${key} must be boolean when present`);
  if (event.stage === 'ci' && !event.candidate) errors.push('ci events require candidate');
  if (event.stage === 'review' && event.findings !== undefined && !event.resolver_type) errors.push('review findings require resolver_type');
  if (event.stage === 'deploy' && (!event.candidate || !event.release || !event.environment || !event.artifact)) errors.push('deploy events require candidate, release, environment and artifact');
  if (event.stage === 'incident' && (!event.environment || !event.linked_intent || !event.recurrence_class)) errors.push('incident events require environment, linked_intent and recurrence_class');
  return errors;
}

export function parseEvents(raw) {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('productivity evidence exceeds 10 MiB');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    try { parsed = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
    catch { throw new Error('productivity evidence must be a JSON array/object or JSONL'); }
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (!events.length) throw new Error('productivity evidence contains no events');
  for (const [i, event] of events.entries()) {
    const errors = validateEvent(event);
    if (errors.length) throw new Error(`event ${i + 1}: ${errors.join('; ')}`);
  }
  return events;
}

export const file = (cfg) => path.join(cfg.layout.state, 'productivity-events.jsonl');

export function readEvents(cfg) {
  const target = file(cfg);
  if (!existsSync(target)) return [];
  return parseEvents(readFileSync(target, 'utf8'));
}

export function ingest(cfg, source) {
  const events = parseEvents(readFileSync(source, 'utf8'));
  const existing = readEvents(cfg);
  const ids = new Set(existing.map((event) => event.id));
  const incoming = new Set();
  for (const event of events) {
    if (ids.has(event.id) || incoming.has(event.id)) throw new Error(`duplicate productivity event id: ${event.id}`);
    incoming.add(event.id);
  }
  mkdirSync(cfg.layout.state, { recursive: true });
  appendFileSync(file(cfg), events.map((event) => JSON.stringify(event)).join('\n') + '\n');
  return { imported: events.length, total: existing.length + events.length, file: file(cfg) };
}

const csvCell = (value) => {
  const string = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
};

export function exportEvents(events, format = 'json') {
  if (format === 'json') return JSON.stringify({ schema: 'harness.productivity-export/v1', events }, null, 2) + '\n';
  if (format !== 'csv') throw new Error('format must be json or csv');
  const keys = ['schema', 'id', 'change', 'stage', 'event', 'at', 'actor_type', 'result', 'candidate',
    'release', 'model', 'model_version', 'cost_usd', 'environment', 'duration_ms', 'active_minutes',
    'first_pass', 'rerun', 'findings', 'resolver_type', 'repair_cause', 'artifact', 'health', 'rollback',
    'failure', 'recurrence_class', 'linked_intent', 'source'];
  return [keys.join(','), ...events.map((event) => keys.map((key) => csvCell(event[key])).join(','))].join('\n') + '\n';
}

export function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

export function distribution(values, unit) {
  if (values.length < MIN_SAMPLE) return { value: null, why: `${values.length} of a needed ${MIN_SAMPLE} observations`, of: values.length };
  return { value: percentile(values, 0.5), p75: percentile(values, 0.75), p90: percentile(values, 0.9), unit, of: values.length };
}

export function summarize(events) {
  const completed = events.filter((event) => event.event === 'completed');
  const changes = new Set(events.map((event) => event.change));
  const accepted = new Set(events.filter((event) => event.stage === 'deploy' && event.event === 'healthy' && event.result === 'pass').map((event) => event.change));
  const failures = new Set(events.filter((event) => event.stage === 'deploy' && ['fail', 'rolled-back'].includes(event.result)).map((event) => event.change));
  const costEvents = events.filter((event) => Number.isFinite(event.cost_usd));
  const cost = costEvents.reduce((sum, event) => sum + event.cost_usd, 0);
  const deploymentCount = accepted.size + failures.size;
  return {
    schema: 'harness.productivity-summary/v1', events: events.length, changes: changes.size,
    elapsed_ms: distribution(completed.map((event) => event.duration_ms).filter(Number.isFinite), 'ms'),
    human_active_minutes: distribution(events.filter((event) => event.actor_type === 'human').map((event) => event.active_minutes).filter(Number.isFinite), 'minutes'),
    total_cost_usd: costEvents.length ? { value: Number(cost.toFixed(4)), of: costEvents.length } : { value: null, why: 'no cost observations', of: 0 },
    cost_per_accepted_change: accepted.size && costEvents.length ? { value: Number((cost / accepted.size).toFixed(4)), of: accepted.size } : { value: null, why: 'no healthy deployment or cost observations', of: 0 },
    first_pass_ci: ratio(events.filter((event) => event.stage === 'ci' && event.first_pass === true && event.result === 'pass').length,
      events.filter((event) => event.stage === 'ci' && event.first_pass !== undefined).length),
    change_failure_rate: ratio(failures.size, accepted.size + failures.size),
    quality_adjusted_throughput: deploymentCount >= MIN_SAMPLE ? { value: accepted.size - failures.size, accepted: accepted.size, failed: failures.size, of: deploymentCount }
      : { value: null, why: `${deploymentCount} of a needed ${MIN_SAMPLE} deployment observations`, of: deploymentCount },
  };
}

function ratio(numerator, denominator) {
  return denominator >= MIN_SAMPLE ? { value: Number((numerator / denominator).toFixed(3)), of: denominator }
    : { value: null, why: `${denominator} of a needed ${MIN_SAMPLE} observations`, of: denominator };
}
