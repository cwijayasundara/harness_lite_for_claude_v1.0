#!/usr/bin/env node
// Read-only adapter for evidence emitted by an existing deployment pipeline. It does not build,
// deploy, promote or roll back anything; those actions and credentials remain pipeline-owned.

import { readFileSync } from 'node:fs';

export const SCHEMA = 'harness.deploy-pipeline-evidence/v1';
const text = (value) => typeof value === 'string' && value.length > 0;

export function assess(record) {
  const findings = [];
  if (record?.schema !== SCHEMA) findings.push(`schema must be ${SCHEMA}`);
  for (const field of ['release', 'candidate', 'artifact']) if (!text(record?.[field])) findings.push(`${field} is required`);
  if (!Array.isArray(record?.events) || !record.events.length) findings.push('events are required');
  if (findings.length) return { ok: false, findings };

  const events = record.events;
  for (const [index, event] of events.entries()) {
    if (!text(event.event) || !text(event.environment) || !text(event.at)) findings.push(`event ${index + 1} lacks event, environment or timestamp`);
    if (event.candidate && event.candidate !== record.candidate) findings.push(`event ${index + 1} names another candidate`);
    if (event.event !== 'rollback' && event.artifact && event.artifact !== record.artifact) findings.push(`event ${index + 1} names another artifact`);
  }
  const find = (name, environment) => events.find((event) => event.event === name && event.environment === environment);
  const staging = find('deployed', 'staging');
  const smoke = find('smoke', 'staging');
  const production = find('deployed', 'production');
  const authorization = events.find((event) => event.event === 'authorized' && event.environment === 'production');
  const healthy = find('healthy', 'production');
  const rollback = find('rollback', 'production');
  const escalation = find('escalated', 'production');

  if (!staging) findings.push('artifact was not deployed to staging');
  if (!smoke) findings.push('staging smoke evidence is absent');
  if (production && smoke?.result !== 'pass') findings.push('production promotion followed a non-passing staging smoke');
  if (production && (!authorization || authorization.candidate !== record.candidate)) findings.push('production promotion lacks candidate-bound authorization');
  if (healthy && !(Number.isFinite(healthy.window_minutes) && healthy.window_minutes > 0)) findings.push('healthy production evidence lacks a positive observation window');

  const migration = record.migration ?? { reversible: true };
  if (production && !healthy) {
    if (migration.reversible === false) {
      if (rollback) findings.push('automatic rollback attempted across an irreversible migration');
      if (!escalation) findings.push('irreversible migration failure was not escalated');
    } else if (!rollback || rollback.result !== 'pass') findings.push('unhealthy production release lacks a successful rollback');
  }

  return {
    schema: 'harness.deploy-pipeline-assessment/v1', ok: findings.length === 0, findings,
    release: record.release, candidate: record.candidate, artifact: record.artifact,
    authorization: authorization ?? null,
    environments: { staging: staging ?? null, production: production ?? null },
    health: healthy ?? null,
    rollback: rollback ?? null,
    escalation: escalation ?? null,
    migration,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const record = JSON.parse(process.argv[2] ? readFileSync(process.argv[2], 'utf8') : readFileSync(0, 'utf8'));
    const result = assess(record);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
