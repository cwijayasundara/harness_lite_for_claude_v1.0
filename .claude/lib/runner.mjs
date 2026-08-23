// The single check runner. Everything — hooks, the agent, CI — goes through here, so there is
// exactly one place where "did this pass?" is decided and exactly one output schema.
//
// Ported from v6's pre-write-gate runCheck pattern: one process, N checks, per-check timing,
// and a throwing check is recorded as `errored` and ISOLATED so it cannot silently disable the
// checks after it.

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { resolveStage } from './config.mjs';
import { normalize } from './normalize.mjs';
import * as ledger from './ledger.mjs';

const LOCAL_CHECKS = {
  secrets: () => import('../checks/secrets.mjs'),
  'plan-drift': () => import('../checks/plan-drift.mjs'),
  budget: () => import('../checks/budget.mjs'),
};

function interpolate(cmd, files, reportPath) {
  const list = files.length ? files.map((f) => JSON.stringify(f)).join(' ') : '.';
  let out = cmd.includes('{files}') ? cmd.replaceAll('{files}', list) : cmd;
  // {report} lets a tool that insists on writing its machine-readable output to a FILE
  // (pytest, eslint -o, coverage) participate in the one finding schema. Without it you are
  // reduced to scraping stdout, which is how "--json-report-file=-" quietly creates a file
  // literally named "-" in the repo root.
  return out.replaceAll('{report}', JSON.stringify(reportPath));
}

async function runOne(cfg, verb, files) {
  const started = Date.now();
  const base = { control: verb, verdict: 'skipped', ms: 0, findings: [], command: '' };

  if (LOCAL_CHECKS[verb]) {
    try {
      const mod = await LOCAL_CHECKS[verb]();
      const res = await mod.run(cfg, files);
      return { ...base, ...res, ms: Date.now() - started };
    } catch (e) {
      return { ...base, verdict: 'errored', ms: Date.now() - started, error: e.message };
    }
  }

  const cmd = cfg.capabilities[verb];
  if (!cmd || cmd.trim() === '') {
    // A missing verb is `skipped`, never `failed`. Coverage grows with the project.
    return { ...base, ms: Date.now() - started, note: `no "${verb}" command in harness.toml` };
  }

  const reportPath = path.join(cfg.layout.state, `${verb}-report.json`);
  const full = interpolate(cmd, files, reportPath);
  try {
    mkdirSync(cfg.layout.state, { recursive: true });
    if (existsSync(reportPath)) rmSync(reportPath, { force: true });
    const r = spawnSync('bash', ['-lc', full], { cwd: cfg.layout.root, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
    if (r.error) return { ...base, verdict: 'errored', ms: Date.now() - started, command: full, error: r.error.message };
    const fmt = cfg.formats[verb] ?? 'generic';
    const payload = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : (r.stdout ?? '');
    const findings = normalize(fmt, payload, r.stderr || r.stdout || '', r.status ?? 0);
    const verdict = (r.status === 0 && findings.length === 0) ? 'pass' : 'fail';
    return { ...base, verdict, ms: Date.now() - started, command: full, findings };
  } catch (e) {
    return { ...base, verdict: 'errored', ms: Date.now() - started, command: full, error: e.message };
  }
}

export async function check(cfg, { stage = 'fast', files = [], write = true } = {}) {
  const verbs = resolveStage(cfg, stage);
  const results = [];
  for (const verb of verbs) results.push(await runOne(cfg, verb, files));

  const cap = cfg.budget.max_findings;
  const report = {
    stage,
    ok: results.every((r) => r.verdict !== 'fail'),
    changed_files: files,
    controls: results.map((r) => ({
      control: r.control, verdict: r.verdict, ms: r.ms,
      findings: (r.findings ?? []).slice(0, cap),
      truncated: Math.max(0, (r.findings ?? []).length - cap),
      ...(r.note ? { note: r.note } : {}),
      ...(r.error ? { error: r.error } : {}),
    })),
  };

  if (write) {
    for (const r of results) {
      ledger.append({
        stage, control: r.control, verdict: r.verdict, ms: r.ms,
        findings: (r.findings ?? []).length, changed_files: files.length,
        ...(r.error ? { error: String(r.error).slice(0, 400) } : {}),
      }, cfg.layout);
    }
    try {
      mkdirSync(path.dirname(cfg.layout.lastCheck), { recursive: true });
      // Full report on disk, capped summary to the agent. Sensor output is the second-largest
      // token sink after file reads.
      writeFileSync(cfg.layout.lastCheck, JSON.stringify({ ...report, controls: results }, null, 2));
    } catch { /* fail open */ }
  }
  return report;
}

// Human/agent-readable rendering. Remediation is attached HERE, at the runner, not left to
// whatever the native tool happened to print — Bockeler's finding that a linter message must
// teach, and must permit a justified escape hatch rather than only suppress-or-comply.
export function render(report, layoutPaths) {
  const lines = [];
  for (const c of report.controls) {
    const mark = { pass: 'PASS', fail: 'FAIL', skipped: 'SKIP', errored: 'ERR ' }[c.verdict];
    lines.push(`${mark}  ${c.control.padEnd(11)} ${c.ms}ms${c.note ? '  (' + c.note + ')' : ''}${c.error ? '  ' + c.error : ''}`);
    for (const f of c.findings ?? []) {
      lines.push(`      ${f.file}${f.line ? ':' + f.line : ''}  ${f.rule}  ${f.message}${f.fix ? '  -> ' + f.fix : ''}`);
    }
    if (c.truncated > 0) lines.push(`      ... ${c.truncated} more, full report: ${layoutPaths?.lastCheck ?? '.claude/state/last-check.json'}`);
  }
  if (!report.ok) {
    lines.push('');
    lines.push('Fix the findings above, or — if a rule is wrong for this code — raise the threshold in');
    lines.push('.claude/harness.toml and say why in the same commit. Do not weaken a test to pass a check.');
  }
  return lines.join('\n');
}
