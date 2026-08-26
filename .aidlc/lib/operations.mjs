import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyBands } from './guard.mjs';

const safe = (value) => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(value);
const ARTIFACT = /^sha256:[a-f0-9]{64}$/;
const OPERATIONS = ['preflight', 'deploy', 'status', 'verify', 'promote', 'rollback'];
const MUTATING = new Set(['deploy', 'promote', 'rollback']);

export function validateDeploymentReceipt(value) {
  const issues = [];
  if (value?.schema !== 'aidlc.deployment-receipt/v1') issues.push('deployment receipt schema is invalid');
  if (!OPERATIONS.includes(value?.operation)) issues.push('deployment receipt operation is invalid');
  if (!safe(value?.environment)) issues.push('deployment receipt environment is invalid');
  if (!['succeeded', 'failed', 'timed-out', 'denied'].includes(value?.status)) issues.push('deployment receipt status is invalid');
  if (value?.artifact_digest != null && !ARTIFACT.test(value.artifact_digest)) issues.push('deployment receipt artifact digest is invalid');
  if (!Number.isFinite(Date.parse(value?.timestamp))) issues.push('deployment receipt timestamp is invalid');
  if (!Array.isArray(value?.command) || !value.command.length) issues.push('deployment receipt command is required');
  return issues;
}

function stateFile(cfg, environment) {
  const state = cfg.layout.state ?? path.join(path.dirname(cfg.layout.deployment), '..', 'state');
  return path.join(state, `deployment-${environment}.json`);
}

function readState(cfg, environment) {
  try { return JSON.parse(readFileSync(stateFile(cfg, environment), 'utf8')); } catch { return { current: null, previous: null, verified: null }; }
}

function writeState(cfg, environment, value) {
  const file = stateFile(cfg, environment); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function receiptFile(cfg, receipt) {
  const issues = validateDeploymentReceipt(receipt); if (issues.length) throw new Error(issues.join('; '));
  mkdirSync(cfg.layout.deployment, { recursive: true });
  const stamp = receipt.timestamp.replace(/[:.]/g, '-');
  const file = path.join(cfg.layout.deployment, `${stamp}-${receipt.environment}-${receipt.operation}-${receipt.receipt_id.slice(0, 8)}.json`);
  writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); return file;
}

function artifactDigest(value) {
  if (value == null || value === '') return null;
  const digest = String(value).includes('@') ? String(value).slice(String(value).lastIndexOf('@') + 1) : String(value);
  if (!ARTIFACT.test(digest)) throw new Error('artifact must be sha256:<64 lowercase hex> or an OCI reference ending in that digest');
  return digest;
}

export function deploy(cfg, operation, environment, { approval = null, approvals = null, risk = 'standard', artifact = null, from = 'staging', now = new Date() } = {}) {
  if (!OPERATIONS.includes(operation)) throw new Error(`operation must be ${OPERATIONS.join(', ')}`);
  if (!safe(environment)) throw new Error('environment must be a canonical slug');
  const configured = cfg.deployment[operation];
  const command = (!Array.isArray(configured) || !configured.length) && cfg.deployment.platform === 'docker-compose'
    ? [process.execPath, fileURLToPath(new URL('../providers/docker-compose.mjs', import.meta.url)), operation]
    : configured;
  if (!Array.isArray(command) || !command.length || command.some((v) => typeof v !== 'string')) throw new Error(`deployment.${operation} must be a non-empty TOML array`);
  const ids = [...new Set((approvals ?? approval ?? '').split(',').map((value) => value.trim()).filter(Boolean))];
  const receipt = {
    schema: 'aidlc.deployment-receipt/v1', receipt_id: randomUUID(), operation, environment,
    source_environment: operation === 'promote' ? from : null, artifact_digest: null, risk,
    approval: ids[0] ?? null, approvals: ids, timestamp: now.toISOString(), status: 'failed', command,
    exit_code: null, signal: null, stdout: '', stderr: '', verification_receipt: null,
  };
  const reject = (message) => {
    receipt.status = 'denied'; receipt.stderr = message; const file = receiptFile(cfg, receipt);
    const error = new Error(message); error.receipt = file; throw error;
  };
  if (!['low', 'standard', 'critical'].includes(risk)) reject('risk must be low, standard, or critical');
  let digest; try { digest = artifactDigest(artifact); } catch (error) { reject(error.message); }
  if (['preflight', 'deploy', 'verify', 'promote'].includes(operation) && !digest) reject(`${operation} requires --artifact sha256:<digest>`);
  if (operation === 'rollback' && !digest) digest = readState(cfg, environment).previous;
  receipt.artifact_digest = digest;
  if (['deploy', 'promote'].includes(operation) && cfg.deployment.require_preflight !== false) {
    const preflight = readState(cfg, environment).preflight;
    if (preflight?.digest !== digest || preflight?.status !== 'succeeded') reject(`artifact ${digest} has no successful latest preflight in ${environment}`);
  }
  if (operation === 'verify' && readState(cfg, environment).current !== digest) reject(`cannot verify ${digest}: it is not the deployed artifact in ${environment}`);
  if (operation === 'promote') {
    if (!safe(from) || from === environment) reject('promotion requires a distinct canonical --from environment');
    const source = readState(cfg, from);
    if (source.verified !== digest || !source.verification_receipt) reject(`artifact ${digest} has no successful latest verification in ${from}`);
    if (source.current !== digest) reject(`artifact ${digest} is no longer deployed in ${from}`);
    receipt.verification_receipt = source.verification_receipt;
  }
  if (environment === 'production' && MUTATING.has(operation) && cfg.deployment.production_requires_approval) {
    if (!(cfg.deployment.production_allowed_risks ?? []).includes(risk)) reject(`risk ${risk} is not authorized for production`);
    const required = risk === 'critical' ? Number(cfg.deployment.critical_approvals ?? 2) : 1;
    if (ids.length < required) reject(`production ${operation} requires ${required} independent approval${required === 1 ? '' : 's'}`);
  }
  const result = spawnSync(command[0], [...command.slice(1), environment], {
    cwd: cfg.layout.root, encoding: 'utf8', timeout: Number(cfg.deployment.timeout_ms ?? 300000),
    env: { ...process.env, HARNESS_ENVIRONMENT: environment, HARNESS_SOURCE_ENVIRONMENT: from, HARNESS_ARTIFACT_DIGEST: digest ?? '', HARNESS_RELEASE_APPROVAL: ids.join(',') },
  });
  receipt.exit_code = result.status; receipt.signal = result.signal;
  receipt.stdout = String(result.stdout ?? '').slice(0, 20000); receipt.stderr = String(result.stderr ?? '').slice(0, 20000);
  receipt.status = result.status === 0 ? 'succeeded' : result.error?.code === 'ETIMEDOUT' ? 'timed-out' : 'failed';
  const file = receiptFile(cfg, receipt);
  if (operation === 'preflight') {
    const before = readState(cfg, environment); writeState(cfg, environment, { ...before, preflight: { digest, status: receipt.status, receipt_id: receipt.receipt_id } });
  }
  if (receipt.status === 'succeeded' && ['deploy', 'promote'].includes(operation)) {
    const before = readState(cfg, environment); writeState(cfg, environment, { ...before, current: digest, previous: before.current, verified: null, verification_receipt: null, receipt_id: receipt.receipt_id });
  }
  if (operation === 'verify') {
    const current = readState(cfg, environment); writeState(cfg, environment, { ...current, verified: receipt.status === 'succeeded' ? digest : null, verification_receipt: receipt.status === 'succeeded' ? receipt.receipt_id : null });
  }
  if (receipt.status === 'succeeded' && operation === 'rollback' && digest) {
    const before = readState(cfg, environment); writeState(cfg, environment, { ...before, current: digest, previous: before.current, verified: null, verification_receipt: null, receipt_id: receipt.receipt_id });
  }
  return { ok: receipt.status === 'succeeded', file, receipt };
}

export function breachedBands(document) {
  return classifyBands(document).propose;
}

function toSlug(metric) {
  return String(metric ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}

export function detect(cfg, { file = null, slug = null, now = new Date() } = {}) {
  let document;
  if (file) {
    document = readMonitorFile(file);
  } else {
    const command = cfg.monitoring?.collect;
    if (!Array.isArray(command) || !command.length || command.some((v) => typeof v !== 'string')) {
      return { configured: false, breached: false, already_open: false, files: [], tier: 0, diagnose: false, rolled_back: false };
    }
    const result = spawnSync(command[0], command.slice(1), {
      cwd: cfg.layout.root, encoding: 'utf8', timeout: Number(cfg.monitoring.timeout_ms ?? 300000),
    });
    if (result.status !== 0) throw new Error(`monitoring.collect exited ${result.status ?? 'null'}`);
    document = JSON.parse(String(result.stdout ?? ''));
  }
  const classified = classifyBands(document);
  const tier = classified.bands.reduce((m, b) => Math.max(m, b.tier), 0);
  if (tier < 2) return { configured: true, breached: false, already_open: false, files: [], breaches: classified.log, tier, diagnose: false, rolled_back: false };
  const lead = classified.propose[0] || classified.diagnose[0];
  const id = slug || toSlug(lead.metric);
  if (!safe(id)) throw new Error('slug must be a canonical slug');
  const incident = path.join(cfg.layout.incident, `${id}.md`);
  const intent = path.join(cfg.layout.intent, `${id}.md`);
  if (existsSync(incident) || existsSync(intent)) {
    return { configured: true, breached: true, already_open: true, files: [], breaches: classified.propose, tier, diagnose: true, rolled_back: false };
  }
  const closed = closeLoop(cfg, id, document, { now, writeIntent: tier >= 3 });
  const rollback = stagingRollback(cfg, tier);
  return { ...closed, configured: true, already_open: false, tier, diagnose: true, ...rollback };
}

function stagingRollback(cfg, tier) {
  if (tier < 3) return { rolled_back: false };
  const command = cfg.deployment?.rollback;
  if (!Array.isArray(command) || !command.length || command.some((v) => typeof v !== 'string')) {
    return { rolled_back: false };
  }
  try {
    const result = deploy(cfg, 'rollback', 'staging');
    return { rolled_back: result.ok, rollback: result };
  } catch (e) {
    return { rolled_back: false, rollback_error: e.message };
  }
}

export function closeLoop(cfg, slug, document, { now = new Date(), writeIntent = true } = {}) {
  if (!safe(slug)) throw new Error('slug must be a canonical slug');
  const classified = classifyBands(document);
  const breaches = writeIntent ? classified.propose : classified.diagnose;
  if (!breaches.length) return { breached: false, files: [], tier: 0 };
  mkdirSync(cfg.layout.incident, { recursive: true }); mkdirSync(cfg.layout.intent, { recursive: true });
  const evidence = breaches.map((b) => `- ${b.metric}: observed ${b.observed} tier ${b.tier}; allowed ${Number.isFinite(b.min) ? `min ${b.min}` : ''}${Number.isFinite(b.min) && Number.isFinite(b.max) ? ', ' : ''}${Number.isFinite(b.max) ? `max ${b.max}` : ''}${Number.isFinite(b.mean) ? ` mean ${b.mean} stdev ${b.stdev}` : ''}; source ${b.source ?? 'unspecified'}`).join('\n');
  const incident = path.join(cfg.layout.incident, `${slug}.md`); const intent = path.join(cfg.layout.intent, `${slug}.md`);
  if (existsSync(incident) || existsSync(intent)) throw new Error(`artifact already exists for ${slug}`);
  const files = [incident];
  writeFileSync(incident, `# Incident: ${slug}\n\n- **Date:** ${now.toISOString().slice(0, 10)}\n- **Detected at:** ${now.toISOString()}\n- **Severity:** ${document.severity ?? 'untriaged'}\n- **Service owner:** ${document.owner ?? 'unassigned'}\n- **Status:** open\n- **Resulting intent:** ${writeIntent ? `[intent/${slug}](../intent/${slug}.md)` : 'pending 3σ propose'}\n\n## Control-band evidence\n\n${evidence}\n\n## Impact\n\nPending human triage.\n`);
  if (writeIntent) {
    writeFileSync(intent, `# Intent: ${slug}\n\n- **Opened at:** ${now.toISOString()}\n- **Author:** monitoring-adapter\n- **Status:** draft\n- **Source incident:** [incident/${slug}](../incident/${slug}.md)\n\n## Problem\n\nA deterministic production control band was breached.\n\n## Proposed outcome\n\nDiagnose and restore the affected metric to its accepted band.\n\n## Constraints\n\nHuman approval remains required at specification, plan, review, and production release gates.\n\n## Evidence\n\n${evidence}\n`);
    files.push(intent);
  }
  return { breached: true, breaches, files };
}

export function readMonitorFile(file) { return JSON.parse(readFileSync(file, 'utf8')); }
