import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const safe = (value) => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(value);

export function deploy(cfg, operation, environment, { approval = null, now = new Date() } = {}) {
  if (!['deploy', 'status', 'rollback'].includes(operation)) throw new Error('operation must be deploy, status, or rollback');
  if (!safe(environment)) throw new Error('environment must be a canonical slug');
  const command = cfg.deployment[operation];
  if (!Array.isArray(command) || !command.length || command.some((v) => typeof v !== 'string')) throw new Error(`deployment.${operation} must be a non-empty TOML array`);
  if (environment === 'production' && cfg.deployment.production_requires_approval && !approval) throw new Error('production operation requires --approval <authorization-id>');
  const result = spawnSync(command[0], [...command.slice(1), environment], {
    cwd: cfg.layout.root, encoding: 'utf8', timeout: Number(cfg.deployment.timeout_ms ?? 300000),
    env: { ...process.env, HARNESS_ENVIRONMENT: environment, HARNESS_RELEASE_APPROVAL: approval ?? '' },
  });
  const receipt = {
    schema: 1, operation, environment, approval, timestamp: now.toISOString(),
    command: command[0], exit_code: result.status, signal: result.signal,
    stdout: String(result.stdout ?? '').slice(0, 20000), stderr: String(result.stderr ?? '').slice(0, 20000),
  };
  mkdirSync(cfg.layout.deployment, { recursive: true });
  const file = path.join(cfg.layout.deployment, `${now.toISOString().replace(/[:.]/g, '-')}-${environment}-${operation}.json`);
  writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n');
  return { ok: result.status === 0, file, receipt };
}

export function breachedBands(document) {
  if (!Array.isArray(document?.bands)) throw new Error('monitor document requires a bands array');
  return document.bands.filter((b) => {
    if (!b.metric || !Number.isFinite(b.observed)) throw new Error('each band requires metric and numeric observed');
    return (Number.isFinite(b.min) && b.observed < b.min) || (Number.isFinite(b.max) && b.observed > b.max);
  });
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
      return { configured: false, breached: false, already_open: false, files: [] };
    }
    const result = spawnSync(command[0], command.slice(1), {
      cwd: cfg.layout.root, encoding: 'utf8', timeout: Number(cfg.monitoring.timeout_ms ?? 300000),
    });
    if (result.status !== 0) throw new Error(`monitoring.collect exited ${result.status ?? 'null'}`);
    document = JSON.parse(String(result.stdout ?? ''));
  }
  const breaches = breachedBands(document);
  if (!breaches.length) return { configured: true, breached: false, already_open: false, files: [], breaches };
  const id = slug || toSlug(breaches[0].metric);
  if (!safe(id)) throw new Error('slug must be a canonical slug');
  const incident = path.join(cfg.layout.incident, `${id}.md`);
  const intent = path.join(cfg.layout.intent, `${id}.md`);
  if (existsSync(incident) || existsSync(intent)) return { configured: true, breached: true, already_open: true, files: [], breaches };
  return { ...closeLoop(cfg, id, document, { now }), configured: true, already_open: false };
}

export function closeLoop(cfg, slug, document, { now = new Date() } = {}) {
  if (!safe(slug)) throw new Error('slug must be a canonical slug');
  const breaches = breachedBands(document);
  if (!breaches.length) return { breached: false, files: [] };
  mkdirSync(cfg.layout.incident, { recursive: true }); mkdirSync(cfg.layout.intent, { recursive: true });
  const evidence = breaches.map((b) => `- ${b.metric}: observed ${b.observed}; allowed ${Number.isFinite(b.min) ? `min ${b.min}` : ''}${Number.isFinite(b.min) && Number.isFinite(b.max) ? ', ' : ''}${Number.isFinite(b.max) ? `max ${b.max}` : ''}; source ${b.source ?? 'unspecified'}`).join('\n');
  const incident = path.join(cfg.layout.incident, `${slug}.md`); const intent = path.join(cfg.layout.intent, `${slug}.md`);
  if (existsSync(incident) || existsSync(intent)) throw new Error(`artifact already exists for ${slug}`);
  writeFileSync(incident, `# Incident: ${slug}\n\n- **Date:** ${now.toISOString().slice(0, 10)}\n- **Detected at:** ${now.toISOString()}\n- **Severity:** ${document.severity ?? 'untriaged'}\n- **Service owner:** ${document.owner ?? 'unassigned'}\n- **Status:** open\n- **Resulting intent:** [intent/${slug}](../intent/${slug}.md)\n\n## Control-band evidence\n\n${evidence}\n\n## Impact\n\nPending human triage.\n`);
  writeFileSync(intent, `# Intent: ${slug}\n\n- **Opened at:** ${now.toISOString()}\n- **Author:** monitoring-adapter\n- **Status:** draft\n- **Source incident:** [incident/${slug}](../incident/${slug}.md)\n\n## Problem\n\nA deterministic production control band was breached.\n\n## Proposed outcome\n\nDiagnose and restore the affected metric to its accepted band.\n\n## Constraints\n\nHuman approval remains required at specification, plan, review, and production release gates.\n\n## Evidence\n\n${evidence}\n`);
  return { breached: true, breaches, files: [incident, intent] };
}

export function readMonitorFile(file) { return JSON.parse(readFileSync(file, 'utf8')); }
