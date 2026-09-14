#!/usr/bin/env node
// G26. One steering change a night, kept only if the suite says it helped.
//
// Every other loop in this harness ends with a human deciding. This one does not, and that is the
// whole point: guidance is the part nobody can reason about reliably, because the thing it steers
// is a model. The only honest way to know whether a sentence in a skill helps is to change it, run
// the suite, and compare — and a person will not do that three hundred times.
//
// So the safety is structural rather than supervisory:
//
//   * It may only touch the steering set. A path outside it is refused before anything runs, not
//     reverted afterwards — an experiment that edited the runner could make its own result.
//   * One file, one change, one run per invocation. A night that changed four things and improved
//     has learned nothing about which of the four did it.
//   * It keeps the commit on a branch or resets the tree. It never merges, and nothing downstream
//     reads its branches: what it produces is a row in a tsv and a branch a human may look at.
//   * It runs only when the recorded eval baseline is green. Scoring a change against a baseline
//     that is already red measures the noise, and the loop would then keep whatever moved the
//     noise most.
//
// It never asks. A loop that asks is a loop that stops on the first night nobody is watching.

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as evalGate from '../.aidlc/lib/eval-gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(HERE);
export const PROGRAM = path.join(HERE, 'experiments', 'program.md');
export const LOG = path.join(HERE, 'experiments.tsv');
export const COLUMNS = ['at', 'experiment', 'file', 'score', 'previous', 'verdict', 'commit', 'usd'];

// The only files an experiment may touch. Guidance, and nothing that could change what a run
// measures: not the runner, not the assertions, not the tasks, not a fixture.
export const STEERING = [
  '.aidlc/instructions.md',
  '.aidlc/skills/',
  '.aidlc/roles/',
  '.aidlc/policies/',
  '.aidlc/templates/project-instructions.md',
];

export function isSteering(rel) {
  const norm = String(rel ?? '').replace(/^\.\//, '');
  return STEERING.some((s) => (s.endsWith('/') ? norm.startsWith(s) : norm === s));
}

// One experiment, read from the program. The format is deliberately dull: a heading names it, and
// the body says which file and what to try. The loop does not invent experiments — a generator
// that wrote its own hypotheses would be optimising against its own taste.
export function parseProgram(text) {
  const out = [];
  for (const block of String(text ?? '').split(/^## /m).slice(1)) {
    const [heading, ...rest] = block.split('\n');
    const body = rest.join('\n');
    const file = /^file:\s*(\S+)\s*$/m.exec(body)?.[1];
    const done = /^status:\s*done\s*$/m.test(body);
    out.push({ name: heading.trim(), file, done, body: body.trim() });
  }
  return out;
}

export function nextExperiment(text) {
  const all = parseProgram(text);
  const pending = all.filter((e) => !e.done);
  if (!pending.length) return { experiment: null, why: 'every experiment in the program is done' };
  const e = pending[0];
  if (!e.file) return { experiment: null, why: `"${e.name}" names no file: add a "file:" line` };
  if (!isSteering(e.file)) {
    return { experiment: null, why: `"${e.name}" names ${e.file}, which is not in the steering set — an experiment that edited what measures it could make its own result` };
  }
  return { experiment: e, why: null };
}

export function readLog(file = LOG) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [COLUMNS[i], v])));
}

// The score a night is judged against: the last run that measured anything.
export function previousScore(rows) {
  for (const row of [...rows].reverse()) {
    // A row whose delta column is empty measured nothing. `Number('')` is 0, which would read as
    // a real previous score of zero and make the next unmeasured night look like an improvement.
    if (String(row.score ?? '').trim() === '') continue;
    const value = Number(row.score);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

// The score is the fraction of golden tasks that passed. Deliberately not the contribution mean
// delta: that one needs the paired native-versus-harness campaign, which costs tens of dollars a
// run and cannot be a nightly. A pass rate over the golden suite is what one night can afford to
// measure, and steering is exactly what it is sensitive to.
//
// Kept when it beat the last measured run, reset when it did not. An unmeasured run is reset too:
// a change whose effect could not be measured has not earned a place in the steering.
export function verdictFor({ score, previous }) {
  if (!Number.isFinite(score)) return { keep: false, verdict: 'unmeasured' };
  if (previous === null) return { keep: true, verdict: 'first' };
  if (score > previous) return { keep: true, verdict: 'improved' };
  return { keep: false, verdict: score === previous ? 'unchanged' : 'regressed' };
}

export function appendRow(row, file = LOG) {
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, `${COLUMNS.join('\t')}\n`);
  appendFileSync(file, `${COLUMNS.map((c) => String(row[c] ?? '')).join('\t')}\n`);
  return file;
}

const git = (root) => {
  const raw = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const g = (...args) => raw(...args).trim();
  // Porcelain status puts the state in the first two columns, and an unstaged modification leaves
  // the first of them blank. Trimming that output eats the blank and takes the leading character
  // of the first path with it, which is how `.aidlc/instructions.md` becomes `aidlc/…`.
  g.raw = raw;
  return g;
};

// Every path the tree differs in, tracked or not, minus the loop's own log. The log is appended
// after the commit, so on the following night it is the one change that must not count as dirt —
// otherwise the first successful run leaves a tree that stops every run after it.
function changedPaths(g, root, log) {
  const ours = path.relative(root, log);
  return g.raw('status', '--porcelain').split('\n')
    .map((line) => /^(..) (.*)$/.exec(line))
    .filter(Boolean)
    // A rename reads `old -> new`; the new name is the one that has to be in the steering set.
    .map(([, state, rest]) => ({ rel: rest.split(' -> ').pop().replace(/^"|"$/g, ''), untracked: state === '??' }))
    .filter((c) => c.rel && c.rel !== ours);
}

// Put the tree back exactly, by path rather than wholesale. `checkout -- .` restores tracked files
// and leaves untracked ones behind, so an experiment that created a file would survive its own
// reset and contaminate the next run.
function revert(g, root, changes) {
  for (const { rel, untracked } of changes) {
    if (untracked) rmSync(path.join(root, rel), { recursive: true, force: true });
    else g('checkout', '--', rel);
  }
}

// The loop. Every outside effect is injected, so the whole thing is testable with no model, no
// spend and no branches left behind.
export async function runExperiment({
  root = ROOT,
  program = PROGRAM,
  log = LOG,
  edit,                 // (experiment) => rel path actually written, or null for "nothing to try"
  measure,              // () => { score, usd }
  gateGreen,            // () => boolean
  now = () => new Date(),
} = {}) {
  const g = git(root);
  if (!gateGreen()) {
    return { ran: false, why: 'the recorded eval baseline is not green — a score measured against a red baseline is noise' };
  }
  const before = changedPaths(g, root, log);
  if (before.length) {
    return { ran: false, why: `the working tree is dirty (${before.map((c) => c.rel).join(', ')}); an experiment must be the only change in its run` };
  }
  const { experiment, why } = nextExperiment(existsSync(program) ? readFileSync(program, 'utf8') : '');
  if (!experiment) return { ran: false, why };

  const startedOn = g('rev-parse', '--abbrev-ref', 'HEAD');
  const branch = `experiment/${experiment.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${now().toISOString().slice(0, 10)}`;
  const written = await edit(experiment);
  if (!written) {
    revert(g, root, changedPaths(g, root, log));
    return { ran: false, why: `"${experiment.name}" produced no edit` };
  }
  // Checked again after the edit, against what was actually written: the program said which file,
  // and this says which file was touched. They are different claims, and only the second one is
  // evidence. Untracked paths count — a new skill file is an edit like any other.
  const touched = changedPaths(g, root, log);
  const outside = touched.filter((c) => !isSteering(c.rel)).map((c) => c.rel);
  if (outside.length) {
    revert(g, root, touched);
    return { ran: false, why: `the edit touched ${outside.join(', ')}, outside the steering set — reverted` };
  }

  const { score, usd } = await measure();
  const previous = previousScore(readLog(log));
  const { keep, verdict } = verdictFor({ score, previous });

  let commit = '';
  if (keep) {
    g('checkout', '-b', branch);
    // Only what the experiment touched. `add -A` would sweep in the log and anything else the run
    // left lying about, and the commit would then no longer be the one change it claims to be.
    g('add', '--', ...touched.map((c) => c.rel));
    g('commit', '-qm', `experiment: ${experiment.name}\n\nscore ${score} against ${previous ?? 'no previous run'}.\nKept on a branch. Nothing merges this; a human decides whether it is real.`);
    commit = g('rev-parse', 'HEAD');
    g('checkout', startedOn);
  } else {
    revert(g, root, touched);
  }

  appendRow({ at: now().toISOString(), experiment: experiment.name, file: experiment.file,
    score: Number.isFinite(score) ? score : '', previous: previous ?? '', verdict, commit, usd: usd ?? '' }, log);
  return { ran: true, experiment: experiment.name, verdict, keep, score, previous, commit, branch: keep ? branch : null };
}


// ---- the real ends of the loop -------------------------------------------------------------
//
// Injected above so the whole thing tests without a model; defaulted here so the nightly has
// something to call.

// Green means the last recorded run agreed with `evals/expected.json`. Not "everything passes" —
// six of the golden tasks are recorded as failing, and waiting for all of them would mean the
// loop never runs. What matters is that the tree is where the record says it is, so tonight's
// score is a score against something known.
export function recordedGateGreen(root = ROOT) {
  const results = evalGate.loadResults(path.join(root, '.aidlc', 'evals', 'results'));
  if (!results) return false;
  try { return evalGate.gate(results, evalGate.readRecord(path.join(root, 'evals', 'expected.json'))).ok; }
  catch { return false; }
}

// One file, one change, and the prompt says which. The model is told the hypothesis a person
// wrote and nothing else: it is making the edit, not choosing it.
export function makeEdit({ root = ROOT, model = null } = {}) {
  return async (experiment) => {
    const { runClaude } = await import('./lib/invoker.mjs');
    const { subscriptionArgs, requireSubscription } = await import('../.aidlc/lib/claude-auth.mjs');
    requireSubscription({ cwd: root });
    const prompt = [
      `Edit exactly one file: ${experiment.file}.`,
      'Change nothing else. Do not create files. Do not touch tests, tasks, fixtures or any code.',
      '',
      'The hypothesis to implement, written by a person:',
      '',
      experiment.body,
      '',
      'Make the smallest edit that tests the hypothesis. Keep the file\'s voice and length.',
    ].join('\n');
    // Read and Edit only, no hooks, no MCP, no settings from anyone's home directory. The scope
    // check after the edit is the guarantee; this is the part that keeps an honest run honest.
    const args = subscriptionArgs(['-p', prompt, ...(model ? ['--model', model] : []),
      '--tools', 'Read,Edit', '--setting-sources', '', '--strict-mcp-config',
      '--mcp-config', '{"mcpServers":{}}', '--settings', '{"disableAllHooks":true}',
      '--permission-mode', 'acceptEdits', '--no-session-persistence', '--output-format', 'json']);
    const out = await runClaude(args, { cwd: root, env: process.env, timeoutMs: 600000 });
    if (out.status !== 0) return null;
    return experiment.file;
  };
}

// Run the golden suite live and score it. A run that graded nothing returns a null score, which
// `verdictFor` reads as unmeasured and resets — never as a zero that a later bad night could beat.
export function makeMeasure({ root = ROOT, concurrency = 4 } = {}) {
  return async () => {
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(root, 'evals', 'run.mjs'), '--live', '--concurrency', String(concurrency)],
        { cwd: root, stdio: 'inherit' });
      child.on('exit', resolve);
    });
    const results = evalGate.loadResults(path.join(root, '.aidlc', 'evals', 'results'));
    const graded = (results?.results ?? []).filter((r) => r.verdict === 'pass' || r.verdict === 'fail');
    if (!graded.length) return { score: null, usd: null };
    const usd = (results.results ?? []).reduce((n, r) => n + (r.usd ?? 0), 0);
    return { score: Number((graded.filter((r) => r.verdict === 'pass').length / graded.length).toFixed(3)), usd: Number(usd.toFixed(2)) };
  };
}

// `node evals/experiment.mjs` reports what it would do; `--live` is the only way to spend anything,
// the same rule the suite itself follows.
export async function main(argv = process.argv.slice(2)) {
  const live = argv.includes('--live');
  if (!live) {
    const { experiment, why } = nextExperiment(existsSync(PROGRAM) ? readFileSync(PROGRAM, 'utf8') : '');
    const rows = readLog();
    console.log(experiment ? `next: ${experiment.name}\n  file: ${experiment.file}` : `nothing to run: ${why}`);
    console.log(`baseline: ${recordedGateGreen() ? 'green' : 'not green'}; previous score ${previousScore(rows) ?? 'none'}; ${rows.length} runs recorded`);
    console.log('No model calls made. Pass --live to run one experiment.');
    return experiment ? 0 : 1;
  }
  const out = await runExperiment({
    gateGreen: () => recordedGateGreen(),
    edit: makeEdit({}),
    measure: makeMeasure({}),
  });
  console.log(JSON.stringify(out, null, 2));
  return out.ran ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
