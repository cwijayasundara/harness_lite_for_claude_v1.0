// G26. One steering change a night, kept only if the suite says it helped.
//
// This is the one loop in the harness with no human in it, so the safety has to be structural.
// Three properties carry it, and all three are tested here with no model and no spend: it cannot
// touch anything outside the steering set, it resets a change that did not beat the last measured
// run, and it never merges — what it produces is a row in a tsv and a branch a person may look at.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  parseProgram, nextExperiment, isSteering, verdictFor, previousScore,
  appendRow, readLog, runExperiment, STEERING, COLUMNS,
} from '../evals/experiment.mjs';
import { ROOT } from './_paths.mjs';

// A repository shaped like the real one: the program is tracked, because a person writes it and
// commits it, and the log is not, because the loop appends to it after the commit it describes.
function repo(programText = PROGRAM) {
  const root = mkdtempSync(path.join(tmpdir(), 'experiment-'));
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...a], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'e@example.invalid');
  git('config', 'user.name', 'Experiment');
  mkdirSync(path.join(root, '.aidlc/skills/implement'), { recursive: true });
  writeFileSync(path.join(root, '.aidlc/instructions.md'), '# steering\n\noriginal line\n');
  writeFileSync(path.join(root, '.aidlc/skills/implement/SKILL.md'), '---\nname: implement\n---\n');
  mkdirSync(path.join(root, 'evals/experiments'), { recursive: true });
  writeFileSync(path.join(root, 'evals/run.mjs'), '// the thing that measures\n');
  writeFileSync(path.join(root, 'evals/experiments/program.md'), programText);
  git('add', '-A');
  git('commit', '-qm', 'base');
  return {
    root, git,
    program: path.join(root, 'evals/experiments/program.md'),
    log: path.join(root, 'evals/experiments.tsv'),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const PROGRAM = `# Experiments

## Try a sharper miss path

file: .aidlc/instructions.md

Some hypothesis.
`;

test('the steering set is guidance only, and never what measures a run', () => {
  for (const allowed of ['.aidlc/instructions.md', '.aidlc/skills/implement/SKILL.md',
    '.aidlc/roles/evaluator.md', '.aidlc/policies/review.md', '.aidlc/templates/project-instructions.md']) {
    assert.ok(isSteering(allowed), `${allowed} should be steering`);
  }
  // The refusal that matters: an experiment that could edit the runner, the assertions, the tasks
  // or a fixture could produce its own result.
  for (const refused of ['evals/run.mjs', 'evals/lib/assertions.mjs', 'evals/tasks.json',
    'evals/fixtures/clean-app/src/app/text.py', '.aidlc/lib/guard.mjs', '.aidlc/bin/harness',
    'test/unit.test.mjs', '.aidlc/harness.toml']) {
    assert.equal(isSteering(refused), false, `${refused} must not be editable by an experiment`);
  }
  assert.ok(STEERING.every((s) => s.startsWith('.aidlc/')), 'the steering set is inside the harness');
});

test('the program is a queue a person wrote, and a bad entry stops the run rather than guessing', () => {
  assert.deepEqual(parseProgram(PROGRAM).map((e) => e.name), ['Try a sharper miss path']);
  assert.equal(nextExperiment(PROGRAM).experiment.file, '.aidlc/instructions.md');

  // Done entries are skipped, and an empty queue is not an error.
  assert.equal(nextExperiment(`${PROGRAM}\nstatus: done\n`).experiment, null);
  assert.match(nextExperiment('').why, /every experiment in the program is done/);

  assert.match(nextExperiment('# x\n\n## No file named\n\nbody\n').why, /names no file/);
  // The important refusal, made before anything runs rather than reverted afterwards.
  assert.match(nextExperiment('# x\n\n## Edit the runner\n\nfile: evals/run.mjs\n').why,
    /not in the steering set/);
});

test('a change is kept only when it beats the last measured run', () => {
  assert.deepEqual(verdictFor({ score: 0.2, previous: null }), { keep: true, verdict: 'first' });
  assert.deepEqual(verdictFor({ score: 0.3, previous: 0.2 }), { keep: true, verdict: 'improved' });
  assert.deepEqual(verdictFor({ score: 0.1, previous: 0.2 }), { keep: false, verdict: 'regressed' });
  assert.deepEqual(verdictFor({ score: 0.2, previous: 0.2 }), { keep: false, verdict: 'unchanged' });
  // A change whose effect could not be measured has not earned a place in the steering.
  assert.deepEqual(verdictFor({ score: null, previous: 0.2 }), { keep: false, verdict: 'unmeasured' });
  assert.deepEqual(verdictFor({ score: NaN, previous: null }), { keep: false, verdict: 'unmeasured' });

  // The comparison skips rows that measured nothing, rather than treating them as zero.
  assert.equal(previousScore([{ score: '0.4' }, { score: '' }]), 0.4);
  assert.equal(previousScore([]), null);
});

test('the loop keeps an improving change on a branch and never merges it', async () => {
  const r = repo();
  try {
    const out = await runExperiment({
      root: r.root, program: r.program, log: r.log,
      gateGreen: () => true,
      edit: () => { writeFileSync(path.join(r.root, '.aidlc/instructions.md'), '# steering\n\nsharper line\n'); return '.aidlc/instructions.md'; },
      measure: () => ({ score: 0.42, usd: 1.5 }),
    });

    assert.equal(out.ran, true);
    assert.equal(out.verdict, 'first');
    assert.equal(out.keep, true);
    assert.ok(out.branch.startsWith('experiment/'));

    // The branch holds the change; the branch it started on does not. Nothing merged.
    assert.equal(r.git('rev-parse', '--abbrev-ref', 'HEAD'), 'master');
    assert.match(readFileSync(path.join(r.root, '.aidlc/instructions.md'), 'utf8'), /original line/,
      'the working tree must be back where it started');
    assert.match(r.git('show', `${out.branch}:.aidlc/instructions.md`), /sharper line/);
    assert.match(r.git('log', '-1', '--format=%B', out.branch), /a human decides whether it is real/);

    const rows = readLog(r.log);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].experiment, 'Try a sharper miss path');
    assert.equal(rows[0].score, '0.42');
    assert.equal(rows[0].verdict, 'first');
    assert.equal(rows[0].usd, '1.5');
  } finally { r.cleanup(); }
});

test('the loop resets a regressing change and still records that it tried', async () => {
  const r = repo();
  try {
    appendRow({ at: 'earlier', experiment: 'a previous night', score: 0.5, verdict: 'first' }, r.log);

    const out = await runExperiment({
      root: r.root, program: r.program, log: r.log,
      gateGreen: () => true,
      edit: () => { writeFileSync(path.join(r.root, '.aidlc/instructions.md'), '# steering\n\nworse line\n'); return '.aidlc/instructions.md'; },
      measure: () => ({ score: 0.1, usd: 1.2 }),
    });

    assert.equal(out.verdict, 'regressed');
    assert.equal(out.keep, false);
    assert.equal(out.branch, null);
    assert.equal(out.commit, '');
    // Nothing left but the loop's own log — which is the one thing a run is supposed to leave, and
    // the one thing the next run's dirty check has to forgive.
    assert.equal(r.git('status', '--porcelain'), '?? evals/experiments.tsv');
    assert.match(readFileSync(path.join(r.root, '.aidlc/instructions.md'), 'utf8'), /original line/);

    // A night that learned nothing still leaves a row: the record is the point.
    const rows = readLog(r.log);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].verdict, 'regressed');
    assert.equal(rows[1].previous, '0.5');
  } finally { r.cleanup(); }
});

test('an edit that strays outside the steering set is reverted and the run refuses', async () => {
  const r = repo();
  try {
    const out = await runExperiment({
      root: r.root, program: r.program, log: r.log,
      gateGreen: () => true,
      // The program named a steering file; the edit touched the runner as well. Both claims are
      // checked, because "which file was named" and "which file was written" are different facts.
      edit: () => {
        writeFileSync(path.join(r.root, '.aidlc/instructions.md'), '# steering\n\nedited\n');
        writeFileSync(path.join(r.root, 'evals/run.mjs'), '// quietly made the suite easier\n');
        return '.aidlc/instructions.md';
      },
      measure: () => { throw new Error('must not measure an experiment that escaped its scope'); },
    });

    assert.equal(out.ran, false);
    assert.match(out.why, /evals\/run\.mjs/);
    assert.match(out.why, /outside the steering set/);
    assert.equal(r.git('status', '--porcelain'), '', 'the stray edit must be reverted, the new file removed');
    assert.equal(readLog(r.log).length, 0, 'a run that never measured anything records no result');
  } finally { r.cleanup(); }
});

test('the loop refuses to start on a red baseline or a dirty tree', async () => {
  const r = repo();
  try {
    const shouldNotRun = { edit: () => { throw new Error('must not edit'); }, measure: () => { throw new Error('must not measure'); } };

    // A delta measured against a red baseline is noise, and the loop would keep whatever moved the
    // noise most.
    const red = await runExperiment({ root: r.root, program: r.program, log: r.log, gateGreen: () => false, ...shouldNotRun });
    assert.equal(red.ran, false);
    assert.match(red.why, /not green/);

    writeFileSync(path.join(r.root, '.aidlc/instructions.md'), '# steering\n\nsomeone was mid-edit\n');
    const dirty = await runExperiment({ root: r.root, program: r.program, log: r.log, gateGreen: () => true, ...shouldNotRun });
    assert.equal(dirty.ran, false);
    assert.match(dirty.why, /dirty/);
  } finally { r.cleanup(); }
});

test('the tsv has one row per run, with a stable header', () => {
  const r = repo();
  try {
    appendRow({ at: 'a', experiment: 'one', score: 0.1, verdict: 'first' }, r.log);
    appendRow({ at: 'b', experiment: 'two', score: 0.2, verdict: 'improved' }, r.log);
    const text = readFileSync(r.log, 'utf8').split('\n').filter(Boolean);
    assert.equal(text[0], COLUMNS.join('\t'), 'the header is written once and never moves');
    assert.equal(text.length, 3);
    assert.deepEqual(readLog(r.log).map((x) => x.experiment), ['one', 'two']);
  } finally { r.cleanup(); }
});

test('the shipped program names only steering files, and every entry says which', () => {
  const program = readFileSync(path.join(ROOT, 'evals/experiments/program.md'), 'utf8');
  const entries = parseProgram(program);
  assert.ok(entries.length >= 2, 'the queue should hold something to try');
  for (const e of entries) {
    assert.ok(e.file, `"${e.name}" names no file`);
    assert.ok(isSteering(e.file), `"${e.name}" names ${e.file}, which is not steering`);
  }
  assert.match(program, /Written by a person, on purpose/);
});
