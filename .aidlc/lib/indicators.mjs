import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function hours(from, to) {
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) return null;
  return Math.round(((Date.parse(to) - Date.parse(from)) / 36e5) * 10) / 10;
}

function mean(values) {
  const xs = values.filter((v) => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000;
}

function commitsAfter(root, file, iso) {
  if (!iso || !file || !existsSync(file)) return null;
  const rel = path.relative(root, file);
  const t = Date.parse(iso);
  const dates = git(root, ['log', '--follow', '--format=%aI', '--', rel]).split('\n').filter(Boolean);
  return dates.filter((d) => Date.parse(d) > t).length;
}

// The widest run wins, then the newest among equals. A three-task smoke must not displace a
// full suite as the thing the indicator — or the gate — reads. Exported because the eval gate
// has to answer "which run are we grading?" the same way this does; two answers to that
// question is how a stale score survives.
export function widestResults(dir) {
  if (!existsSync(dir)) return null;
  const parsed = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const body = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
      const total = Number(body.summary?.total);
      const pass = Number(body.summary?.pass);
      if (Number.isFinite(total) && total > 0 && Number.isFinite(pass)) parsed.push({ source: name, pass, total, body });
    } catch { /* skip unreadable result files */ }
  }
  if (!parsed.length) return null;
  const maxTotal = Math.max(...parsed.map((p) => p.total));
  const widest = parsed.filter((p) => p.total === maxTotal).sort((a, b) => a.source.localeCompare(b.source));
  return widest[widest.length - 1];
}

function latestEval(dir) {
  const w = widestResults(dir);
  if (!w) return { source: null, pass: null, total: null, rate: null };
  return { source: w.source, pass: w.pass, total: w.total, rate: Math.round((w.pass / w.total) * 1000) / 1000 };
}

export function playbookIndicators(cfg, rows) {
  const intents = rows.map((r) => r.artifacts.intent).filter(Boolean);
  const approved = intents.filter((i) => (i.status === 'accepted' || i.status === 'approved') && i.approved_at);
  const closed = intents.filter((i) => i.status === 'closed' && i.committed_at);
  const decided = approved.length + closed.length;
  const reviews = rows.filter((r) => r.artifacts.review && (r.artifacts.review.status === 'approved' || r.artifacts.review.status === 'changes-requested'));
  const firstPass = reviews.filter((r) => r.artifacts.review.status === 'approved' && !git(cfg.layout.root, ['log', '-S', 'changes-requested', '--', path.relative(cfg.layout.root, r.artifacts.review.file)]));
  return {
    intent_survival: {
      approved: approved.length,
      closed: closed.length,
      draft: intents.filter((i) => i.status === 'draft').length,
      rate: decided ? Math.round((approved.length / decided) * 1000) / 1000 : null,
    },
    intent_commit_hours: { mean: mean(intents.map((i) => hours(i.opened_at, i.committed_at))) },
    design_hours: { mean: mean(rows.map((r) => hours(r.artifacts.intent?.committed_at, r.artifacts.spec?.committed_at))) },
    intent_rework_after_spec: { mean: mean(rows.map((r) => r.artifacts.intent && r.artifacts.spec?.committed_at ? commitsAfter(cfg.layout.root, r.artifacts.intent.file, r.artifacts.spec.committed_at) : null)) },
    spec_rework_after_plan: { mean: mean(rows.map((r) => r.artifacts.spec && r.artifacts.plan?.committed_at ? commitsAfter(cfg.layout.root, r.artifacts.spec.file, r.artifacts.plan.committed_at) : null)) },
    first_pass_review: {
      first_pass: firstPass.length,
      total: reviews.length,
      rate: reviews.length ? Math.round((firstPass.length / reviews.length) * 1000) / 1000 : null,
    },
    eval_pass_rate: latestEval(path.join(cfg.layout.aidlc, 'evals', 'results')),
  };
}

export function renderPlaybook(playbook) {
  const s = playbook.intent_survival;
  const survival = s.rate == null ? 'unmeasured' : `${s.approved}/${s.approved + s.closed} accepted (${s.rate})`;
  const evalr = playbook.eval_pass_rate.rate == null ? 'unmeasured' : `${playbook.eval_pass_rate.pass}/${playbook.eval_pass_rate.total} (${playbook.eval_pass_rate.rate})`;
  const first = playbook.first_pass_review.rate == null ? 'unmeasured' : `${playbook.first_pass_review.first_pass}/${playbook.first_pass_review.total} (${playbook.first_pass_review.rate})`;
  const hours = playbook.intent_commit_hours.mean;
  const rework = playbook.spec_rework_after_plan.mean;
  return [
    '',
    'playbook',
    `  intent survival             ${survival}`,
    `  time to committed intent    ${hours == null ? 'unmeasured' : `${hours}h mean`}`,
    `  spec rework after plan      ${rework == null ? 'unmeasured' : `${rework} commits mean`}`,
    `  first-pass review           ${first}`,
    `  eval pass rate              ${evalr}`,
  ].join('\n');
}
