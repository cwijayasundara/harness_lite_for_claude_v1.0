import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SENSOR_PROFILES, VERBS } from './config.mjs';
import { runControls } from './runner.mjs';

export const PROFILES = Object.keys(DEFAULT_SENSOR_PROFILES);
export const DEFECT_PROFILE = {
  'do-nothing': 'behaviour',
  'test-cheating': 'qa',
  'boundary-breaking': 'architecture',
  'security-defective': 'hardening',
};

function available(cfg, control) {
  return control === 'secrets' || Boolean(cfg.capabilities[control]?.trim());
}

export function diagnose(cfg) {
  const required = cfg.sensors.required_profiles ?? PROFILES;
  const profiles = PROFILES.map((name) => {
    const configured = cfg.sensors[name] ?? [];
    const unknown = configured.filter((control) => !VERBS.includes(control));
    const live = configured.filter((control) => VERBS.includes(control) && available(cfg, control));
    const issues = [
      ...(unknown.length ? [`unknown controls: ${unknown.join(', ')}`] : []),
      ...(required.includes(name) && live.length === 0 ? ['no live capability'] : []),
    ];
    return { name, required: required.includes(name), configured, live, ok: issues.length === 0, issues };
  });
  const latency = Number(cfg.sensors.latency_budget_ms);
  const issues = [];
  if (!Number.isFinite(latency) || latency <= 0) issues.push('latency_budget_ms must be a positive number');
  for (const name of required) if (!PROFILES.includes(name)) issues.push(`unknown required profile: ${name}`);
  return { ok: issues.length === 0 && profiles.every((profile) => profile.ok), latency_budget_ms: latency, profiles, issues };
}

export async function runGauntlet(cfg, { files = [], profiles = PROFILES, write = true } = {}) {
  const started = Date.now();
  const health = diagnose(cfg);
  const selected = [...new Set(profiles)];
  const results = [];
  for (const name of selected) {
    const definition = health.profiles.find((profile) => profile.name === name);
    if (!definition) {
      results.push({ profile: name, verdict: 'errored', ms: 0, controls: [], issues: ['unknown profile'] });
      continue;
    }
    if (definition.live.length === 0) {
      results.push({ profile: name, verdict: definition.required ? 'unavailable' : 'skipped', ms: 0, controls: [], issues: definition.issues });
      continue;
    }
    const profileStarted = Date.now();
    const controls = await runControls(cfg, definition.live, { files, write });
    const verdict = controls.some((control) => control.verdict === 'errored') ? 'errored'
      : controls.some((control) => control.verdict === 'fail') ? 'fail'
      : controls.every((control) => control.verdict === 'pass') ? 'pass' : 'unavailable';
    results.push({ profile: name, verdict, ms: Date.now() - profileStarted, controls });
  }
  const ms = Date.now() - started;
  const latency_ok = ms <= health.latency_budget_ms;
  const required = cfg.sensors.required_profiles ?? PROFILES;
  const report = {
    schema: 'aidlc.sensor-run/v1', generated_at: new Date().toISOString(), project: cfg.project.name ?? null,
    changed_files: files, latency_budget_ms: health.latency_budget_ms, ms, latency_ok,
    profiles: results,
    ok: latency_ok && health.issues.length === 0 && required.every((name) => results.some((profile) => profile.profile === name && profile.verdict === 'pass')),
  };
  if (write) {
    mkdirSync(cfg.layout.state, { recursive: true });
    writeFileSync(path.join(cfg.layout.state, 'last-gauntlet.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

export function qualifyExperiment(value) {
  const issues = [];
  if (value?.schema !== 'aidlc.sensor-experiment/v1') issues.push('schema must be aidlc.sensor-experiment/v1');
  const stacks = ['python', 'typescript', 'jvm'];
  const baselines = Array.isArray(value?.baselines) ? value.baselines : [];
  const cases = Array.isArray(value?.cases) ? value.cases : [];
  for (const stack of stacks) {
    if (!baselines.some((item) => item.stack === stack && item.ok === true)) issues.push(`${stack}: healthy baseline did not pass`);
    for (const [defect, expected] of Object.entries(DEFECT_PROFILE)) {
      const found = cases.find((item) => item.stack === stack && item.defect === defect);
      if (!found) issues.push(`${stack}: missing ${defect} experiment`);
      else if (!Array.isArray(found.detected_by) || !found.detected_by.includes(expected)) issues.push(`${stack}/${defect}: ${expected} did not detect defect`);
    }
  }
  const latencyBudget = Number(value?.latency_budget_ms);
  if (!Number.isFinite(latencyBudget) || latencyBudget <= 0) issues.push('latency_budget_ms must be positive');
  for (const item of [...baselines, ...cases]) {
    if (!Number.isFinite(item.latency_ms) || item.latency_ms > latencyBudget) issues.push(`${item.stack}/${item.defect ?? 'baseline'}: latency budget exceeded`);
  }
  const profiles = PROFILES.map((profile) => {
    const catches = cases.filter((item) => item.detected_by?.includes(profile));
    const unique = catches.filter((item) => item.detected_by.length === 1);
    return { profile, catches: catches.length, unique_catches: unique.length, verdict: unique.length ? 'earning-its-place' : 'candidate-for-deletion' };
  });
  for (const profile of profiles) if (!profile.unique_catches) issues.push(`${profile.profile}: no incremental seeded-defect value`);
  return { schema: 'aidlc.sensor-qualification/v1', ok: issues.length === 0, stacks, profiles, issues };
}

export function renderGauntlet(report) {
  const lines = report.profiles.map((profile) => `${profile.verdict.toUpperCase().padEnd(11)} ${profile.profile.padEnd(14)} ${profile.ms}ms  ${profile.controls.map((c) => c.control).join(', ') || profile.issues?.join(', ')}`);
  lines.push(`${report.latency_ok ? 'PASS' : 'FAIL'}        latency        ${report.ms}/${report.latency_budget_ms}ms`);
  return lines.join('\n');
}
