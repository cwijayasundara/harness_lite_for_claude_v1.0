import { readFileSync, existsSync } from 'node:fs';
import { parseToml } from './toml.mjs';
import { layout } from './paths.mjs';

// G11. `stop_hook` is the stage the Stop hook runs, and it is deliberately not `stop`. The full
// suite belongs to the delivery driver, which runs it once per iteration; running it again at the
// end of every turn paid for the same seconds repeatedly and was the dominant per-turn cost.
export const DEFAULT_STAGES = { fast: ['fmt', 'lint', 'typecheck'], stop: ['fast', 'test'],
  stop_hook: ['fast', 'test_changed'], commit: ['stop', 'secrets'], drift: ['coverage', 'deps'] };

// G06. A gate is a policy, not a constant. Three modes, and the difference between them is
// *where* the gate is answered, never whether it is recorded:
//
//   human     — today's behaviour. An unapproved or out-of-scope product write is refused.
//   advisory  — the same judgment is reported and the write proceeds. The refusal becomes an
//               `additionalContext` warning at the hook, a `warn` verdict at the check, and a
//               row rather than an error exit at `harness status`. The merge decision reads it.
//   auto      — the driver records the approval itself (`approved_by: policy`) with a digest of
//               the policy that let it, and the PR body lists it.
//
// `merge` takes one value. A machine that can approve its own merge has no gate at all, and
// `approve-is-the-humans` exists precisely because every other gate in this harness is one tool
// call away. Law 8 is amended in this change to say the rest of it: gates are recorded at the
// edges; in advisory mode they inform the merge decision rather than block the build loop.
export const GATE_MODES = ['human', 'advisory', 'auto'];
export const DEFAULT_GATES = { spec: 'advisory', plan: 'advisory', merge: 'human' };
// G09. The driver's bounds. A run stops and names the bound it hit; it never exceeds one.
export const DEFAULT_DELIVER = { max_minutes: 60, max_usd: 10 };
// G10. One effort band per kind of work, not per model id.
export const EFFORT_LEVELS = ['low', 'medium', 'high'];
export const DEFAULT_EFFORT = { implement: 'low', repair: 'medium', review: 'high' };

// Which model and which effort a phase runs on. One table, so the driver, the rendered
// frontmatter and the ledger row cannot disagree about what ran.
export function stageModel(cfg, phase) {
  const models = cfg?.models ?? {};
  const effort = { ...DEFAULT_EFFORT, ...(cfg?.effort ?? {}) };
  switch (phase) {
    case 'implement': return { model: models.generator, effort: effort.implement };
    case 'repair': return { model: models.generator, effort: effort.repair };
    case 'review': return { model: models.evaluator, effort: effort.review };
    default: return { model: null, effort: null };
  }
}
// `test_changed` is the `test` capability narrowed to what the turn touched. It is its own verb
// rather than a flag because a project's narrow-test command is not derivable from its full one:
// `node --test test/*.test.mjs` has nowhere to put a file list. Unset, it is `skipped` like any
// other capability the project has not configured (Law 6).
// G14. `mutation`, `sast` and `layers` are opt-in: in no default stage, empty in the template,
// and documented in OPERATING.md with the command each expects. They are declared here so a
// project that configures one gets the normaliser and the `doctor` row rather than a silent
// capability the runner does not recognise.
export const VERBS = ['fmt', 'lint', 'typecheck', 'test', 'test_changed', 'coverage', 'arch',
  'secrets', 'deps', 'mutation', 'sast', 'layers'];

// A misspelled mode is a gate nobody chose. It fails loudly here rather than silently reading as
// whichever branch the `=== 'human'` comparison happened to be written as — the failure mode the
// `require_contract` default already cost this repository once.
function gates(raw = {}) {
  const merged = { ...DEFAULT_GATES, ...raw };
  for (const [gate, mode] of Object.entries(merged)) {
    if (!DEFAULT_GATES[gate]) throw new Error(`unknown gate "${gate}" in [gates] — known: ${Object.keys(DEFAULT_GATES).join(', ')}`);
    if (!GATE_MODES.includes(mode)) throw new Error(`[gates].${gate} = "${mode}" is not a mode — use ${GATE_MODES.join(', ')}`);
  }
  if (merged.merge !== 'human') throw new Error('[gates].merge must be "human": the harness never approves its own merge');
  return merged;
}

// The one reader of a gate's mode. Callers that hold a cfg built by hand rather than by
// `loadConfig` (every guard unit test, the hook's fail-open path) get the same default an
// unconfigured project gets, so a cfg cannot mean two different things depending on where it
// came from.
export const gateMode = (cfg, gate) => cfg?.gates?.[gate] ?? DEFAULT_GATES[gate];

// `human` blocks; `advisory` and `auto` report. `auto` does not block because the driver records
// the approval as it goes — there is nothing left to wait for.
export const gateBlocks = (cfg, gate) => gateMode(cfg, gate) === 'human';

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
    // G03. `[sensors]` is not parsed into cfg. Nothing at runtime ever read `cfg.sensors`: the
    // live reader is `test/contracts.test.mjs`, which parses the TOML directly to ask whether
    // every required profile's commands are reachable from a stage. Defaults merged here were a
    // second copy of that table for nobody.
    check: { fail_fast: true, ...(raw.check ?? {}) },
    graph: { include: ['.', '.claude/harness'], exclude: ['node_modules', '.venv', 'dist', 'target', '.git', '.claude/worktrees'], ...(raw.graph ?? {}) },
    // G03. Only `max_findings` is read — by `buildReport`, to cap what a control shows the model.
    // `subagent_context_soft`, `subagent_context_hard`, `change_cost_ceiling` and
    // `review_diff_max_bytes` were defaults nothing ever looked at: numbers that read as policy
    // and governed nothing, which is worse than their absence because a reader believes them.
    budget: { max_findings: 20, ...(raw.budget ?? {}) },
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
    // close-the-harness B3 (F38): the registry is protected by default in every installed
    // repository — an agent edited it in a task about a health endpoint. A plan that names it
    // still may change it, as any protected path. Merged ahead of the project's own list.
    guard: {
      // The read gate's threshold, in lines. 350 is where a whole-file read stops being cheaper
      // than the index: pack-bench measures 20–38% saved on the toy fixture and 84–97% on files
      // the size of this repository's own. `0` turns the gate off for a project whose tree the
      // graph does not index.
      deny_bash: [], require_contract: true, read_lines: 350, ...(raw.guard ?? {}),
      protected_paths: [...new Set(['.claude/harness/harness.toml', ...(raw.guard?.protected_paths ?? [])])],
    },
    // lean-v2 B7. Three model ids: the `implement` skill and the `evaluator` agent are rendered
    // from the first two by `harness init`, and the eval suite runs on the third. Defaults rather
    // than required, so a project that says nothing still gets an evaluator stronger than its
    // generator instead of one model marking its own work.
    models: {
      generator: 'claude-sonnet-5',
      evaluator: 'claude-opus-5',
      evals: 'claude-haiku-4-5-20251001',
      ...(raw.models ?? {}),
      // G10. `judgment` is the model that decides rather than types: the intent, spec, plan and
      // design skills, and the evaluator's own prompt. It defaults to `evaluator` because that is
      // what a project that has not thought about it should get — one model marking its own
      // homework is the failure this table exists to prevent, and a `judgment` that silently fell
      // back to `generator` would reintroduce it.
      judgment: raw.models?.judgment ?? raw.models?.evaluator ?? 'claude-opus-5',
    },
    // G10. Effort per stage, rendered into the same frontmatter as the model and passed to the
    // driver's own turns. Typing under an approved plan is the cheap band; judging is the
    // expensive one; a repair sits between them because it is re-reading a verdict, not writing
    // one from nothing.
    effort: { ...DEFAULT_EFFORT, ...(raw.effort ?? {}) },
    // every-control-fires-or-goes B1: control name -> the test that plants the defect its why:
    // names. The audit reads it to tell a deterrent from a corpse; nothing else does.
    deterrents: raw.deterrents ?? {},
    gates: gates(raw.gates),
    deliver: { ...DEFAULT_DELIVER, ...(raw.deliver ?? {}) },
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
