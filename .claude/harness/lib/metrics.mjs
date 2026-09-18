// G25. The playbook's own numbers, from evidence this harness already writes.
//
// Seven questions a team asks about how it is working, each answered from something already on
// disk — the ledger, the artifact chain, the driver's phase records, the eval evidence. Nothing
// here is instrumented specially for reporting: a metric that needs its own collection is a metric
// that measures whether the collection is running.
//
// Every metric can come back unmeasured, and says why. A rate over three changes is not a rate,
// and a number computed from too little evidence is worse than a gap, because a gap invites the
// question and a number closes it.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as ledger from './ledger.mjs';
import { read as readArtifact, slugs } from './artifacts.mjs';

// Below this, a proportion is an anecdote with a decimal point.
export const MIN_SAMPLE = 5;

const unmeasured = (why) => ({ value: null, why });
const rate = (hits, total, why) => (total < MIN_SAMPLE
  ? unmeasured(`${total} of a needed ${MIN_SAMPLE} — ${why}`)
  : { value: Number((hits / total).toFixed(3)), of: total });

// 1. First-pass CI success. A check invocation is the unit: how often did a stage come back green
// without anyone having to go round again?
export function firstPassChecks(rows) {
  const runs = rows.filter((r) => r.kind === 'check-invocation' && r.stage !== 'fast');
  return rate(runs.filter((r) => r.ok).length, runs.length, 'not enough non-fast check invocations recorded');
}

// 2. Rework cycles per change: how many repair turns the driver needed, per change it delivered.
// Read from the phase records rather than counted anywhere, because the driver already writes them.
export function reworkCycles(cfg) {
  const dir = path.join(cfg.layout.state, 'deliver');
  if (!existsSync(dir)) return unmeasured('no change has been delivered by `harness deliver` yet');
  const runs = [];
  for (const slug of readdirSync(dir)) {
    const file = path.join(dir, slug, 'phases.json');
    if (!existsSync(file)) continue;
    try { runs.push(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* a half-written run is not a data point */ }
  }
  if (!runs.length) return unmeasured('no phase records on disk');
  const repairs = runs.reduce((n, r) => n + (r.repairs ?? 0), 0);
  return { value: Number((repairs / runs.length).toFixed(2)), of: runs.length };
}

// 3. Plan approval to pull request. The approval carries its own timestamp; the driver's phase
// record carries when it opened the PR.
export function planToPr(cfg) {
  const dir = path.join(cfg.layout.state, 'deliver');
  if (!existsSync(dir)) return unmeasured('no change has been delivered by `harness deliver` yet');
  const spans = [];
  for (const slug of readdirSync(dir)) {
    const file = path.join(dir, slug, 'phases.json');
    if (!existsSync(file)) continue;
    let state;
    try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    const opened = (state.events ?? []).find((e) => e.phase === 'pr' && e.event === 'end')?.at;
    const plan = readArtifact(cfg, slug, 'plan');
    const approved = plan?.front?.at;
    if (!opened || !approved) continue;
    const hours = (Date.parse(opened) - Date.parse(approved)) / 3600000;
    if (Number.isFinite(hours) && hours >= 0) spans.push(hours);
  }
  if (!spans.length) return unmeasured('no delivered change has both an approval time and a PR time');
  spans.sort((a, b) => a - b);
  return { value: Number(spans[Math.floor(spans.length / 2)].toFixed(2)), unit: 'hours (median)', of: spans.length };
}

// 4. Spec edits after the first plan. A spec that keeps moving after its plan was written is a
// spec that was approved too early, and the chain records it: an approved plan binds the spec's
// digest, and a spec whose body no longer matches that digest was edited afterwards.
export function specChurn(cfg) {
  const changes = slugs(cfg);
  let withPlan = 0;
  let moved = 0;
  for (const slug of changes) {
    const plan = readArtifact(cfg, slug, 'plan');
    if (!plan?.front?.spec_digest) continue;
    withPlan++;
    const spec = readArtifact(cfg, slug, 'spec');
    if (spec && plan.front.spec_digest !== spec.front.digest) moved++;
  }
  return rate(moved, withPlan, 'not enough plans bind a spec digest');
}

// 5. Escaped versus caught. A control that fired caught something; an incident recorded as an eval
// is something that got out. The ratio is the one number that says whether the controls are where
// the defects are.
export function escapedVersusCaught(cfg, rows) {
  const caught = rows.filter((r) => r.verdict === 'fail' && r.rule).length;
  const pending = path.join(cfg.layout.harness, 'evals', 'pending');
  const escaped = existsSync(pending) ? readdirSync(pending).filter((f) => f.endsWith('.json')).length : 0;
  if (caught + escaped < MIN_SAMPLE) return unmeasured(`${caught + escaped} of a needed ${MIN_SAMPLE} events`);
  return { value: Number((escaped / (caught + escaped)).toFixed(3)), escaped, caught };
}

// 6. Repeat incident class. The same rule firing over and over is a control doing its job or a
// guidance gap nobody closed, and which one it is depends on whether the same rule keeps winning.
export function repeatClasses(rows, { top = 3 } = {}) {
  const counts = new Map();
  for (const r of rows) if (r.verdict === 'fail' && r.rule) counts.set(r.rule, (counts.get(r.rule) ?? 0) + 1);
  if (!counts.size) return unmeasured('no rule has fired');
  return {
    value: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([rule, n]) => ({ rule, fires: n })),
    of: [...counts.values()].reduce((a, b) => a + b, 0),
  };
}

// 7. Eval mean delta trend: what the harness contributed, over the runs that measured both arms.
export function contributionTrend(root) {
  const file = path.join(root, 'evals', 'evidence', 'contribution.json');
  if (!existsSync(file)) return unmeasured('no contribution record — run the plugin-eval suite with --ablation with-without');
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'));
    const mean = record.aggregates?.meanDelta;
    if (!Number.isFinite(mean)) return unmeasured('the recorded run measured no case in both arms');
    return { value: mean, of: record.aggregates.measured, at: record.at };
  } catch { return unmeasured('the contribution record is not readable JSON'); }
}

// Changes merged, from git rather than from anything the harness writes: the `Harness-Change:`
// trailer the driver puts on a pull request body is also what a squash merge keeps.
export function deliveredChanges(root, { days = 30 } = {}) {
  try {
    const log = execFileSync('git', ['log', `--since=${days}.days`, '--format=%B'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const named = new Set([...log.matchAll(/^Harness-Change:\s*(\S+)$/gm)].map((m) => m[1]));
    return named.size ? { value: named.size, of: days } : unmeasured(`no commit in ${days} days carries a Harness-Change trailer`);
  } catch { return unmeasured('this tree has no git history to read'); }
}

export function metrics(cfg, { days = 30 } = {}) {
  const rows = ledger.read(cfg.layout).filter((r) => {
    const ts = Date.parse(r.ts);
    return Number.isFinite(ts) && ts >= Date.now() - days * 86400000;
  });
  return {
    days,
    rows: rows.length,
    first_pass_checks: firstPassChecks(rows),
    rework_cycles_per_change: reworkCycles(cfg),
    plan_approval_to_pr: planToPr(cfg),
    spec_edits_after_plan: specChurn(cfg),
    escaped_versus_caught: escapedVersusCaught(cfg, rows),
    repeat_classes: repeatClasses(rows),
    eval_contribution: contributionTrend(cfg.layout.root),
    delivered_changes: deliveredChanges(cfg.layout.root, { days }),
  };
}

export function render(m) {
  const lines = [`metrics over ${m.days} days · ${m.rows} ledger rows`, ''];
  const show = (label, metric, format = (v) => String(v)) => {
    lines.push(metric.value === null
      ? `  ${label.padEnd(28)} unmeasured — ${metric.why}`
      : `  ${label.padEnd(28)} ${format(metric.value)}${metric.of !== undefined ? `  (n=${metric.of})` : ''}`);
  };
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  show('first-pass checks', m.first_pass_checks, pct);
  show('rework cycles / change', m.rework_cycles_per_change);
  show('plan approval to PR', m.plan_approval_to_pr, (v) => `${v} h (median)`);
  show('spec edits after plan', m.spec_edits_after_plan, pct);
  show('escaped of all defects', m.escaped_versus_caught, pct);
  show('eval contribution', m.eval_contribution, (v) => `${v >= 0 ? '+' : ''}${v}`);
  show('changes delivered', m.delivered_changes);
  show('repeat classes', m.repeat_classes, (v) => v.map((c) => `${c.rule} x${c.fires}`).join(', '));
  lines.push('', 'A metric reads `unmeasured` when the evidence is too thin to carry it. That is the',
    'honest answer: a rate over three events is an anecdote with a decimal point.');
  return lines.join('\n');
}
