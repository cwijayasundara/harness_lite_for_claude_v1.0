// The Maintain loop, made auditable: a control-band breach becomes an incident, the incident
// becomes an intent, and the clock between them is an SLA.
//
// This lived in lifecycle.mjs alongside the pre-contract intent -> spec -> plan -> review walk
// and was moved out intact when that walk was retired. It was never part of it: an incident
// links to an intent, and knows nothing about specs or plans.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function field(body, name) {
  return body.match(new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.+)$`, 'mi'))?.[1]?.replace(/<!--.*$/, '').trim() || null;
}

function metadata(file) {
  if (!existsSync(file)) return null;
  const body = readFileSync(file, 'utf8');
  return { file, status: field(body, 'Status'), detected_at: field(body, 'Detected at') };
}

function firstCommit(root, file) {
  const out = git(root, ['log', '--follow', '--format=%aI', '--reverse', '--', path.relative(root, file)]);
  return out.split('\n').filter(Boolean)[0] ?? null;
}

function hours(from, to) {
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) return null;
  return Math.round(((Date.parse(to) - Date.parse(from)) / 36e5) * 10) / 10;
}

// `unmeasured` is not `within`. A clock that never started has no verdict to give.
export function verdict(elapsed, limit) {
  if (elapsed == null || limit == null) return 'unmeasured';
  return elapsed <= limit ? 'within' : 'breached';
}

function names(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3));
}

export function incidents(cfg, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  return names(cfg.layout.incident).sort().map((slug) => {
    const incident = metadata(path.join(cfg.layout.incident, `${slug}.md`));
    const intent = metadata(path.join(cfg.layout.intent, `${slug}.md`));
    const elapsed = hours(incident.detected_at, intent ? firstCommit(cfg.layout.root, intent.file) ?? nowIso : nowIso);
    const issues = [];
    if (!incident.detected_at || !Number.isFinite(Date.parse(incident.detected_at))) issues.push('incident: missing or invalid Detected at');
    if (!intent) issues.push('incident: linked intent is missing');
    return {
      slug,
      elapsed_minutes: elapsed == null ? null : Math.round(elapsed * 60),
      limit_minutes: cfg.sla.incident_to_intent_minutes,
      sla: verdict(elapsed == null ? null : elapsed * 60, cfg.sla.incident_to_intent_minutes),
      valid: issues.length === 0,
      issues,
    };
  });
}

export function renderIncidents(rows) {
  if (!rows.length) return '';
  const lines = ['', 'incidents', '', '  incident                       to-intent  integrity  SLA'];
  for (const row of rows) lines.push(`  ${row.slug.padEnd(30)} ${(row.elapsed_minutes == null ? '-' : `${row.elapsed_minutes}m`).padStart(9)}  ${(row.valid ? 'valid' : 'INVALID').padEnd(9)} ${row.sla}`);
  const issues = rows.flatMap((row) => row.issues.map((issue) => `  ERROR ${row.slug}: ${issue}`));
  if (issues.length) lines.push('', ...issues);
  return lines.join('\n') + '\n';
}
