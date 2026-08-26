import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const KINDS = ['intent', 'spec', 'plan', 'review'];
const ALLOWED = {
  // `approved` remains readable for pre-v1 repositories; new intent artifacts use `accepted`.
  intent: new Set(['draft', 'accepted', 'approved', 'closed']),
  spec: new Set(['draft', 'approved']),
  plan: new Set(['draft', 'approved']),
  review: new Set(['draft', 'approved', 'changes-requested']),
};

const accepted = (kind, status) => kind === 'intent'
  ? status === 'accepted' || status === 'approved'
  : status === 'approved';

function field(body, name) {
  return body.match(new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.+)$`, 'mi'))?.[1]?.replace(/<!--.*$/, '').trim() || null;
}

function metadata(file, kind) {
  if (!existsSync(file)) return null;
  const body = readFileSync(file, 'utf8');
  return { file, kind, status: field(body, 'Status'), opened_at: field(body, 'Opened at'), detected_at: field(body, 'Detected at') };
}

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function firstCommit(root, file) {
  const out = git(root, ['log', '--follow', '--format=%aI', '--reverse', '--', path.relative(root, file)]);
  return out.split('\n').filter(Boolean)[0] ?? null;
}

function approvalCommit(root, artifact) {
  if (!artifact) return null;
  const rel = path.relative(root, artifact.file);
  const commits = git(root, ['log', '--follow', '--format=%H', '--reverse', '--', rel]).split('\n').filter(Boolean);
  for (const commit of commits) {
    const body = git(root, ['show', `${commit}:${rel}`]);
    if (accepted(artifact.kind, field(body, 'Status'))) return git(root, ['show', '-s', '--format=%aI', commit]) || null;
  }
  return null;
}

function names(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3));
}

function allSlugs(L) {
  return [...new Set(KINDS.flatMap((kind) => names(L[kind])))].sort();
}

function hours(from, to) {
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) return null;
  return Math.round(((Date.parse(to) - Date.parse(from)) / 36e5) * 10) / 10;
}

function verdict(value, limit) {
  if (value == null || limit == null) return 'unmeasured';
  return value <= limit ? 'within' : 'breached';
}

function activeStage(a) {
  if (!a.intent) return 'intent';
  if (a.intent.status === 'closed') return 'closed';
  if (!a.intent.approved_at) return 'intent-acceptance';
  if (!a.spec) return 'spec';
  if (!a.spec.approved_at) return 'spec-approval';
  if (!a.plan) return 'plan';
  if (!a.plan.approved_at) return 'plan-approval';
  if (!a.review) return 'review';
  if (!a.review.approved_at) return 'review-approval';
  return 'complete';
}

export function lifecycle(cfg, onlySlug = null, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  return (onlySlug ? [onlySlug] : allSlugs(cfg.layout)).map((slug) => {
    const artifacts = Object.fromEntries(KINDS.map((kind) => {
      const item = metadata(path.join(cfg.layout[kind], `${slug}.md`), kind);
      return [kind, item ? { ...item, committed_at: firstCommit(cfg.layout.root, item.file), approved_at: approvalCommit(cfg.layout.root, item) } : null];
    }));
    const issues = [];
    for (const kind of KINDS) {
      const item = artifacts[kind];
      if (item && !ALLOWED[kind].has(item.status)) issues.push(`${kind}: invalid or missing Status`);
      if (item && accepted(kind, item.status) && !item.approved_at) issues.push(`${kind}: ${kind === 'intent' ? 'acceptance' : 'approval'} is not committed`);
    }
    for (let i = 1; i < KINDS.length; i++) {
      const current = artifacts[KINDS[i]]; const previous = artifacts[KINDS[i - 1]];
      if (current && (!previous || !accepted(KINDS[i - 1], previous.status))) issues.push(`${KINDS[i]} exists before ${KINDS[i - 1]} ${KINDS[i - 1] === 'intent' ? 'acceptance' : 'approval'}`);
      if (current?.committed_at && previous?.approved_at && Date.parse(current.committed_at) < Date.parse(previous.approved_at)) issues.push(`${KINDS[i]} was committed before ${KINDS[i - 1]} approval`);
    }
    const stage = activeStage(artifacts);
    const clocks = {
      intent: hours(artifacts.intent?.opened_at, artifacts.intent?.approved_at ?? nowIso),
      design: hours(artifacts.intent?.approved_at, artifacts.spec?.approved_at ?? nowIso),
      planning: hours(artifacts.spec?.approved_at, artifacts.plan?.approved_at ?? nowIso),
      delivery: hours(artifacts.plan?.approved_at, artifacts.review?.committed_at ?? nowIso),
      review: hours(artifacts.review?.committed_at, artifacts.review?.approved_at ?? nowIso),
    };
    const limits = { intent: cfg.sla.intent_hours, design: cfg.sla.design_hours, planning: cfg.sla.planning_hours, delivery: cfg.sla.build_hours, review: cfg.sla.review_hours };
    const slas = Object.fromEntries(Object.keys(clocks).map((name) => [name, { hours: clocks[name], limit_hours: limits[name], verdict: verdict(clocks[name], limits[name]) }]));
    const slaVerdicts = Object.values(slas).map((s) => s.verdict);
    const sla = slaVerdicts.includes('breached') ? 'breached' : slaVerdicts.includes('within') ? 'within' : 'unmeasured';
    return { slug, stage, valid: issues.length === 0, issues, sla, slas, artifacts };
  });
}

export function incidents(cfg, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  return names(cfg.layout.incident).sort().map((slug) => {
    const incident = metadata(path.join(cfg.layout.incident, `${slug}.md`), 'incident');
    const intent = metadata(path.join(cfg.layout.intent, `${slug}.md`), 'intent');
    const elapsed = hours(incident.detected_at, intent ? firstCommit(cfg.layout.root, intent.file) ?? nowIso : nowIso);
    const issues = [];
    if (!incident.detected_at || !Number.isFinite(Date.parse(incident.detected_at))) issues.push('incident: missing or invalid Detected at');
    if (!intent) issues.push('incident: linked intent is missing');
    return { slug, elapsed_minutes: elapsed == null ? null : Math.round(elapsed * 60), limit_minutes: cfg.sla.incident_to_intent_minutes, sla: verdict(elapsed == null ? null : elapsed * 60, cfg.sla.incident_to_intent_minutes), valid: issues.length === 0, issues };
  });
}

export function renderLifecycle(rows, incidentRows = []) {
  if (!rows.length && !incidentRows.length) return 'lifecycle  no artifacts';
  const lines = ['lifecycle', '', '  change                         next-stage        integrity  SLA'];
  for (const row of rows) lines.push(`  ${row.slug.padEnd(30)} ${row.stage.padEnd(17)} ${(row.valid ? 'valid' : 'INVALID').padEnd(9)} ${row.sla}`);
  if (incidentRows.length) {
    lines.push('', 'incidents', '', '  incident                       to-intent  integrity  SLA');
    for (const row of incidentRows) lines.push(`  ${row.slug.padEnd(30)} ${(row.elapsed_minutes == null ? '-' : `${row.elapsed_minutes}m`).padStart(9)}  ${(row.valid ? 'valid' : 'INVALID').padEnd(9)} ${row.sla}`);
  }
  const issues = [...rows, ...incidentRows].flatMap((row) => row.issues.map((issue) => `  ERROR ${row.slug}: ${issue}`));
  if (issues.length) lines.push('', ...issues);
  return lines.join('\n');
}
