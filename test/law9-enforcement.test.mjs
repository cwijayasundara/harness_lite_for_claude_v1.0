// G23. The constitution may not claim more enforcement than CI performs.
//
// Law 9 read "*(enforced: CI)*" for weeks while no CI job ran the eval suite at all. That is the
// most expensive kind of documentation defect: it is the sentence a reader uses to decide they do
// not need to check. This makes the claim and the mechanism the same fact — if one moves without
// the other, the suite says so.
//
// It is deliberately a two-way check. Claiming enforcement that does not exist is the failure that
// happened; claiming less than exists is how a gate quietly stops being trusted and then stops
// being fixed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// The gate step in the nightly job, and whether it is allowed to fail the build.
function gateStep() {
  const workflow = read('.github/workflows/harness.yml');
  const start = workflow.indexOf('harness evals gate');
  assert.ok(start > 0, 'no nightly step runs `harness evals gate`');
  const block = workflow.slice(Math.max(0, start - 400), start + 200);
  return { blocking: !/continue-on-error: true[^]{0,300}harness evals gate/.test(block), workflow };
}

function recorded() {
  const record = JSON.parse(read('evals/expected.json'));
  const tasks = record.tasks ?? record;
  const verdicts = Object.values(tasks).map((t) => (typeof t === 'string' ? t : t.verdict));
  return {
    pass: verdicts.filter((v) => v === 'pass').length,
    fail: verdicts.filter((v) => v === 'fail').length,
    flaky: verdicts.filter((v) => v === 'flaky').length,
  };
}

test('Law 9 claims exactly the enforcement the nightly job performs', () => {
  const law = read('docs/CONSTITUTION.md').match(/### Law 9 — Evals before controls \*\(enforced: ([^)]+)\)\*/);
  assert.ok(law, 'Law 9 has no enforcement clause to check');
  const clause = law[1];
  const { blocking } = gateStep();
  const green = recorded().fail === 0 && recorded().flaky === 0;

  if (green && blocking) {
    assert.match(clause, /nightly CI/, 'the baseline is green and the gate blocks — Law 9 should say so');
  } else {
    // The honest clause while the record still holds failing or flaky tasks. A gate that fails
    // every night is a gate people stop reading, so it does not block — and the constitution must
    // not imply that it does.
    assert.match(clause, /non-blocking until the baseline is green/,
      `the gate is ${blocking ? 'blocking' : 'non-blocking'} and the record has ${recorded().fail} fail / ${recorded().flaky} flaky`);
    assert.equal(blocking, false, 'the gate blocks, so Law 9 is claiming less enforcement than exists');
  }
});

test('the golden task count in the constitution and the README is the count in tasks.json', () => {
  const tasks = JSON.parse(read('evals/tasks.json'));
  const n = (tasks.tasks ?? tasks).length;
  // "Twenty" outlived the twentieth task by two. A number in prose that nothing checks is a number
  // that drifts, and this one is the floor Law 9 names.
  assert.match(read('docs/CONSTITUTION.md'), new RegExp(`^${n} golden tasks`, 'm'));
  assert.match(read('evals/README.md'), new RegExp(`^${n} golden tasks are the Law 9 floor`, 'm'));
});

test('the recorded baseline says what it is, where a reader will look', () => {
  const { pass, fail, flaky } = recorded();
  const readme = read('evals/README.md');
  // The counts are stated rather than left for a reader to compute from a JSON file, and stating
  // them wrongly fails here.
  assert.match(readme, new RegExp(`\\*\\*${pass} pass, ${fail} fail, ${flaky} flaky\\.\\*\\*`),
    `evals/README.md does not state the recorded baseline (${pass} pass, ${fail} fail, ${flaky} flaky)`);
  // And it says what making the gate blocking actually requires, because the tempting shortcut is
  // to edit the record rather than to run the suite.
  assert.match(readme, /Marking\s+a task green without a run that says so/);
  assert.match(readme, /drop `continue-on-error`/);
});
