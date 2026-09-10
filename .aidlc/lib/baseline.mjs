// The cost ratchet.
//
// "Keep token usage in check" only means something if a regression fails a build. The honest
// split: the numbers below are the token surface THE HARNESS CONTROLS — what it puts in front
// of the model on every session and every turn — and they are fully deterministic, so they
// ratchet today with no key and no spend. The model-side per-change cost (output tokens, USD)
// is a separate slot, filled by the eval suite's `under_baseline` assertion when it runs with
// a key. Measuring the deterministic half is not a proxy for the other half; it is the half
// that regressions actually come from, because it is the half we keep editing.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { estimateTokens, pack } from './pack.mjs';
import * as graph from './graph.mjs';
import { query } from './graph.mjs';
import { check, render } from './runner.mjs';
import { sessionContext } from './session.mjs';

// Metrics where LOWER is better; a rise beyond tolerance is a regression.
export const RATCHETED = [
  'claude_md_tokens', 'session_context_tokens', 'check_stop_tokens', 'pack_tokens_p50',
];

const fileTokens = (p) => (existsSync(p) ? estimateTokens(readFileSync(p, 'utf8')) : 0);

export async function capture(cfg) {
  const g = graph.ensure(cfg);

  // B1. What SessionStart puts in the model's context every single session — the exact string,
  // from the one function that assembles it.
  //
  // why: this was four hand-written lines reconstructing a payload the hook builds in full. The
  // hook grew the map, hubs, contract, current-change and superseded lines and the reconstruction
  // did not, so the ratchet recorded 52 tokens against a real payload of 649 and failed nothing —
  // it was grading a string no session had ever been sent.
  const session = sessionContext(cfg);

  // What a green stage puts in front of the model on the way to "done".
  // `all: true` so the measurement does not depend on fail-fast stopping early.
  const report = await check(cfg, { stage: 'stop', files: [], write: false, all: true });
  const rendered = render(report, cfg.layout);
  // Which controls could not run here at all. A machine missing ruff renders "tool not
  // installed" instead of three PASS lines, and grading that against a machine that has ruff
  // is measuring the laptop, not the harness.
  const errored = report.controls.filter((c) => c.verdict === 'errored').map((c) => c.control);

  // Pack size on the repo's own most-connected symbols — deterministic, and representative of
  // what the map skill will actually cost in this repo.
  // Hubs first; in a repo with no intra-project imports (small, or a flat script tree) there
  // are none, and a metric that silently reads 0 is worse than one that reads something honest.
  const hubs = query(g, 'hubs', null, { limit: 5 }).map((h) => h.module);
  const sources = hubs.length ? hubs
    : Object.entries(g.modules).sort((a, b) => b[1].symbols.length - a[1].symbols.length).slice(0, 5).map(([m]) => m);
  const terms = sources.flatMap((m) => (g.modules[m]?.symbols ?? []).slice(0, 2).map((s) => s.name)).slice(0, 10);
  const packs = terms.map((t) => pack(cfg, g, t, { budget: 1200 }).tokens).sort((a, b) => a - b);
  const p50 = packs.length ? packs[Math.floor(packs.length / 2)] : 0;

  return {
    captured_at: new Date().toISOString(),
    tolerance: 1.10,
    claude_md_tokens: fileTokens(cfg.layout.claudeMd),
    session_context_tokens: estimateTokens(session),
    check_stop_tokens: estimateTokens(rendered),
    pack_tokens_p50: p50,
    pack_samples: terms.length,
    graph_modules: Object.keys(g.modules).length,
    graph_symbols: Object.values(g.modules).reduce((n, m) => n + m.symbols.length, 0),
    errored_controls: errored,
    // the-gate-grades-what-it-can-measure B1. Whether the stage this measured was green.
    //
    // why: `check_stop_tokens` is the size of a GREEN stage's output — two PASS lines here — and
    // it was graded whether or not the stage was green. `--stage commit` runs by construction on
    // an uncommitted tree, where the stage fails and the rendered failure text is a hundred times
    // larger, so the gate reported a 157x rise that said nothing about the change.
    stop_ok: report.ok,
    // Filled by the eval suite when it runs with a key; never fabricated here.
    model: null,
  };
}

export const file = (cfg) => path.join(cfg.layout.aidlc, 'baseline.json');

export function save(cfg, b) { writeFileSync(file(cfg), JSON.stringify(b, null, 2) + '\n'); return file(cfg); }
export function load(cfg) { return existsSync(file(cfg)) ? JSON.parse(readFileSync(file(cfg), 'utf8')) : null; }

// Metrics that only mean something when the same toolchain is present on both sides.
const ENVIRONMENT_SENSITIVE = new Set(['check_stop_tokens']);

export function compare(base, now) {
  const tol = base.tolerance ?? 1.10;
  // A control that errors here but not there (or the reverse) makes the stage output
  // incomparable. Grading it anyway produces a red build that says nothing about the change —
  // and a control people learn to ignore is a control that has already died.
  const envDiffers = JSON.stringify([...(base.errored_controls ?? [])].sort())
    !== JSON.stringify([...(now.errored_controls ?? [])].sort());
  // B1. The same incomparability, one step out: a control that ERRORS is caught above, and a
  // control that FAILS is caught here. `undefined` reads as green so a baseline recorded before
  // this field existed keeps grading — the same "record what has no history, do not grade it"
  // rule already applied to a missing metric.
  const stopDiffers = (base.stop_ok !== false) !== (now.stop_ok !== false) || now.stop_ok === false;
  const rows = RATCHETED.map((k) => {
    const was = base[k] ?? 0;
    const is = now[k] ?? 0;
    const skipped = !ENVIRONMENT_SENSITIVE.has(k) ? null
      : envDiffers
        ? `toolchain differs (${(now.errored_controls ?? []).join(', ') || 'none'} vs ${(base.errored_controls ?? []).join(', ') || 'none'})`
        : stopDiffers
          ? `stage outcome differs (stop ${now.stop_ok === false ? 'failed' : 'passed'} now, ${base.stop_ok === false ? 'failed' : 'passed'} when recorded) — this metric measures a green stage`
          : null;
    // A metric with no baseline yet is recorded, not graded — the same rule the eval suite uses.
    const regressed = !skipped && was > 0 && is > was * tol;
    return { metric: k, was, is, delta: was ? (is - was) / was : 0, regressed, skipped };
  });
  // B4. A recorded key that the current capture does not produce is a file that has drifted from
  // its schema. `wiki_index_tokens` sat in baseline.json for weeks after capture() stopped
  // producing it, and nothing said so, because compare() only ever looked at RATCHETED. Reported
  // here rather than graded: the repair is a re-capture, not a tolerance argument.
  const unknown = Object.keys(base).filter((k) => !(k in now));
  return { tolerance: tol, envDiffers, rows, unknown, ok: rows.every((r) => !r.regressed) };
}
