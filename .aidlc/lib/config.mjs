import { readFileSync, existsSync } from 'node:fs';
import { parseToml } from './toml.mjs';
import { layout } from './paths.mjs';

export const DEFAULT_STAGES = { fast: ['fmt', 'lint', 'typecheck'], stop: ['fast', 'test'], commit: ['stop', 'secrets'], drift: ['coverage', 'deps'] };
export const VERBS = ['fmt', 'lint', 'typecheck', 'test', 'test_quality', 'coverage', 'arch', 'secrets', 'deps'];
export const DEFAULT_SENSOR_PROFILES = {
  behaviour: ['test', 'coverage'],
  architecture: ['arch'],
  hardening: ['secrets', 'deps'],
  qa: ['test_quality', 'fmt', 'lint', 'typecheck'],
};

export function loadConfig(root) {
  const L = layout(root);
  if (!existsSync(L.config)) {
    const err = new Error(`no harness.toml at ${L.config} — run: harness init`);
    err.code = 'ENOCONFIG';
    throw err;
  }
  const raw = parseToml(readFileSync(L.config, 'utf8'));
  const cfg = {
    project: raw.project ?? {},
    capabilities: raw.capabilities ?? {},
    formats: raw.formats ?? {},
    stages: { ...DEFAULT_STAGES, ...(raw.stages ?? {}) },
    sensors: {
      ...DEFAULT_SENSOR_PROFILES,
      required_profiles: Object.keys(DEFAULT_SENSOR_PROFILES),
      latency_budget_ms: 120000,
      ...(raw.sensors ?? {}),
    },
    check: { fail_fast: true, ...(raw.check ?? {}) },
    graph: { include: ['.', '.aidlc'], exclude: ['node_modules', '.venv', 'dist', 'target', '.git'], ...(raw.graph ?? {}) },
    budget: { subagent_context_soft: 140000, subagent_context_hard: 200000, change_cost_ceiling: 4.0, max_findings: 20, review_diff_max_bytes: 200000, ...(raw.budget ?? {}) },
    limits: { skills: 12, hooks: 5, agents: 3, hook_loc: 600, claude_md_lines: 120, ...(raw.limits ?? {}) },
    // require_contract defaults ON. It used to default off while the installed template set it
    // true, so the control ran for anyone who took the template and not for anyone who did not —
    // and the second group was invisible, because a control that is absent looks exactly like a
    // control that passed. That is how every eval fixture ended up ungoverned, and how
    // contract-scope-honesty was read as a model failure twice.
    //
    // protected_paths and deny_bash stay empty: a list of project-specific paths has a genuine
    // "nothing to declare", which a boolean gate does not. The spread below means an explicit
    // false is still honoured — a default is what happens when nobody chose.
    guard: { protected_paths: [], deny_bash: [], require_contract: true, ...(raw.guard ?? {}) },
    sla: { intent_hours: 8, design_hours: 24, planning_hours: 8, build_hours: 72, review_hours: 24, incident_to_intent_minutes: 60, ...(raw.sla ?? {}) },
    layout: L,
  };
  return cfg;
}

// Expand a stage name into a flat, de-duplicated list of verbs. Stages may reference
// other stages ("stop = [\"fast\", \"test\"]") — one level of indirection, resolved here so
// no caller ever has to know about it.
export function resolveStage(cfg, stage, seen = new Set()) {
  if (seen.has(stage)) throw new Error(`stage cycle at "${stage}"`);
  seen.add(stage);
  const entries = cfg.stages[stage];
  if (!entries) throw new Error(`unknown stage "${stage}" — known: ${Object.keys(cfg.stages).join(', ')}`);
  const out = [];
  for (const e of entries) {
    if (cfg.stages[e]) out.push(...resolveStage(cfg, e, seen));
    else out.push(e);
  }
  return [...new Set(out)];
}
