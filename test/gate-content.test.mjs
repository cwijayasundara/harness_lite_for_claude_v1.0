// a-plan-proves-its-spec. F14 and F17 are the same absence at two points in the chain: every
// precondition `approve()` enforces is about an artifact's *state* (committed, ordered, digest),
// none about its *content*. These tests are that content check — a template `harness new` wrote
// and nobody edited, and a plan whose Proof table is missing a row for a behaviour its spec
// claims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, BIN } from './_paths.mjs';
import { bodyDigest, render } from '../.aidlc/lib/artifacts.mjs';

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-gate-content-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

function commit(root, message) {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
}

const specPath = (root, slug) => path.join(root, '.aidlc/artifacts', slug, 'spec.md');
const planPath = (root, slug) => path.join(root, '.aidlc/artifacts', slug, 'plan.md');

// A real, non-scaffold spec: one `### B<n>` per id given, none of it template prose.
function realSpec(ids) {
  const behaviours = ids.map((id) => `### ${id}\n\nGiven a real precondition for ${id}\nWhen the matching action happens\nThen a real, specific result follows\n`).join('\n');
  return `---\nstatus: draft\n---\n# Spec: demo\n\n## Outcome\n\nA concrete, observable result stated in the language of the affected user.\n\n## Observable behaviours\n\n${behaviours}\n## Out of scope\n\nEverything not named above.\n\n## Safeguards\n\nNone beyond what the behaviours already state.\n`;
}

// A real, non-scaffold plan. `rows` maps behaviour id -> Proof-table evidence text.
function realPlan(rows) {
  const table = Object.entries(rows).map(([id, evidence]) => `| ${id} | ${evidence} |`).join('\n');
  return `---\nstatus: draft\n---\n# Plan: demo\n\n## Approach\n\nA concrete approach, and the alternative not taken.\n\n## Files\n\n- \`demo.txt\`\n\n## Order\n\n1. Write \`demo.txt\`.\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n${table}\n`;
}

// B1. `harness new` writes the scaffold from `.aidlc/templates/`; this is that real output,
// unedited, so the fixture cannot drift from what the checker reads.
test('approve refuses an unedited spec.md, naming the placeholder it found', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'template-spec').status, 0);
    commit(root, 'new template-spec');

    const result = run(root, 'approve', 'template-spec', 'spec', '--by', 'tester');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /spec\.md/);
    assert.match(result.stderr, /placeholder/);
    assert.match(result.stderr, /The observable result/);
    const front = readFileSync(specPath(root, 'template-spec'), 'utf8');
    assert.match(front, /^status: draft$/m, 'a refused approval must not mark the artifact approved');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('approve refuses an unedited plan.md, naming the placeholder it found', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'template-plan').status, 0);
    writeFileSync(specPath(root, 'template-plan'), realSpec(['B1']));
    commit(root, 'new template-plan, real spec');
    assert.equal(run(root, 'approve', 'template-plan', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved');

    const result = run(root, 'approve', 'template-plan', 'plan', '--by', 'tester');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /plan\.md/);
    assert.match(result.stderr, /placeholder/);
    assert.match(result.stderr, /The chosen approach/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B2. Presence of a row, and nothing more — F11 and F15 record that every plan an agent has
// written unprompted proves behaviours with prose, not a resolvable test.
test('approve refuses a plan missing proof rows for behaviours its spec claims, naming each', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'missing-rows').status, 0);
    writeFileSync(specPath(root, 'missing-rows'), realSpec(['B1', 'B2', 'B3', 'B4']));
    writeFileSync(planPath(root, 'missing-rows'), realPlan({ B1: 'manual check: B1 verified by hand', B3: 'manual check: B3 verified by hand' }));
    commit(root, 'missing-rows drafted');
    assert.equal(run(root, 'approve', 'missing-rows', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved');

    const result = run(root, 'approve', 'missing-rows', 'plan', '--by', 'tester');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /plan\.md/);
    assert.match(result.stderr, /B2/);
    assert.match(result.stderr, /B4/);
    assert.doesNotMatch(result.stderr, /\bB1\b/); // B1 has a row; it must not be named as missing
    assert.doesNotMatch(result.stderr, /\bB3\b/); // B3 has a row; it must not be named as missing
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('approve accepts a plan naming a test file that does not exist yet — presence is the bar', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'not-written-yet').status, 0);
    writeFileSync(specPath(root, 'not-written-yet'), realSpec(['B1']));
    writeFileSync(planPath(root, 'not-written-yet'), realPlan({ B1: '`test/not-written-yet.test.mjs` — a test this plan has not written yet' }));
    assert.equal(existsSync(path.join(root, 'test/not-written-yet.test.mjs')), false);
    commit(root, 'not-written-yet drafted');
    assert.equal(run(root, 'approve', 'not-written-yet', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved');

    const result = run(root, 'approve', 'not-written-yet', 'plan', '--by', 'tester');
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B3. Every refusal from B1 or B2 names the file, what is missing, and the fix.
test('each refusal names the file, what is missing, and the single fix', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'named-refusal').status, 0);
    commit(root, 'new named-refusal');
    const templateRefusal = run(root, 'approve', 'named-refusal', 'spec', '--by', 'tester');
    assert.equal(templateRefusal.status, 1);
    assert.match(templateRefusal.stderr, /spec\.md/); // the file
    assert.match(templateRefusal.stderr, /placeholder/); // what is missing
    assert.match(templateRefusal.stderr, /before approving/); // the fix

    writeFileSync(specPath(root, 'named-refusal'), realSpec(['B1', 'B2']));
    writeFileSync(planPath(root, 'named-refusal'), realPlan({ B1: 'manual check: B1 verified by hand' }));
    commit(root, 'real spec, incomplete plan');
    assert.equal(run(root, 'approve', 'named-refusal', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved');
    const proofRefusal = run(root, 'approve', 'named-refusal', 'plan', '--by', 'tester');
    assert.equal(proofRefusal.status, 1);
    assert.match(proofRefusal.stderr, /plan\.md/); // the file
    assert.match(proofRefusal.stderr, /B2/); // what is missing
    assert.match(proofRefusal.stderr, /## Proof/); // the fix
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B4. A human can say the rule is wrong here, and the exception leaves a record.
test('--anyway <reason> proceeds past a content refusal and records approved_anyway', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'override').status, 0);
    writeFileSync(specPath(root, 'override'), realSpec(['B1', 'B2']));
    writeFileSync(planPath(root, 'override'), realPlan({ B1: 'manual check: B1 verified by hand' }));
    commit(root, 'override drafted');
    assert.equal(run(root, 'approve', 'override', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved');

    const blocked = run(root, 'approve', 'override', 'plan', '--by', 'tester');
    assert.equal(blocked.status, 1);

    const overridden = run(root, 'approve', 'override', 'plan', '--by', 'tester', '--anyway', 'B2 is proved by a manual smoke test, tracked in the incident ticket');
    assert.equal(overridden.status, 0, overridden.stderr);
    const front = readFileSync(planPath(root, 'override'), 'utf8');
    assert.match(front, /^status: approved$/m);
    assert.match(front, /^approved_anyway: B2 is proved by a manual smoke test, tracked in the incident ticket$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--anyway with no reason is refused', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'no-reason').status, 0);
    commit(root, 'new no-reason');
    const result = run(root, 'approve', 'no-reason', 'spec', '--by', 'tester', '--anyway');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--anyway needs a reason/);
    const front = readFileSync(specPath(root, 'no-reason'), 'utf8');
    assert.match(front, /^status: draft$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B6. This check applies at the moment of approval. An artifact approved before this change
// exists stays approved when merely read — re-approving is a human's decision, not a migration's.
test('an artifact approved before this change still reads approved', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'pre-existing').status, 0);
    // Still the scaffold, and stamped approved directly — the way a migration or an older
    // harness would have left it, with no content check ever having run.
    const text = readFileSync(specPath(root, 'pre-existing'), 'utf8');
    const digest = bodyDigest(text);
    writeFileSync(specPath(root, 'pre-existing'), render({ status: 'approved', by: 'migrated', at: '2026-01-01T00:00:00.000Z', digest }, text.replace(/^---\n[\s\S]*?\n---\n?/, '')));
    commit(root, 'pre-existing approved by migration');

    const result = run(root, 'status', 'pre-existing');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /stale-approval/);
    const front = readFileSync(specPath(root, 'pre-existing'), 'utf8');
    assert.match(front, /^status: approved$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B7 (evidence.md F25). B2 asserts presence of a Proof row only, because a plan may legitimately
// name a test it has not written yet. This is that promise checked at the moment the answer is
// knowable — `check --stage commit` — never at approval.
test('check --stage commit fails when an approved plan\'s proof row names a test file that does not exist', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'unkept-promise').status, 0);
    writeFileSync(specPath(root, 'unkept-promise'), realSpec(['B1']));
    writeFileSync(planPath(root, 'unkept-promise'), realPlan({ B1: '`test/unkept-promise.test.mjs` — the test this behaviour will be proved by' }));
    commit(root, 'unkept-promise drafted');
    assert.equal(run(root, 'approve', 'unkept-promise', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved');
    assert.equal(run(root, 'approve', 'unkept-promise', 'plan', '--by', 'tester').status, 0);
    commit(root, 'plan approved');
    assert.equal(existsSync(path.join(root, 'test/unkept-promise.test.mjs')), false, 'the promised test was never written');

    const result = run(root, 'check', '--stage', 'commit');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /unkept-promise/);
    assert.match(result.stdout, /B1/);
    assert.match(result.stdout, /test\/unkept-promise\.test\.mjs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('check --stage commit passes once the promised test file exists', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'kept-promise').status, 0);
    writeFileSync(specPath(root, 'kept-promise'), realSpec(['B1']));
    writeFileSync(planPath(root, 'kept-promise'), realPlan({ B1: '`test/kept-promise.test.mjs` — the test this behaviour is proved by' }));
    mkdirSync(path.join(root, 'test'), { recursive: true });
    writeFileSync(path.join(root, 'test/kept-promise.test.mjs'), "import { test } from 'node:test';\ntest('kept-promise', () => {});\n");
    commit(root, 'kept-promise drafted, with its test');
    assert.equal(run(root, 'approve', 'kept-promise', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved');
    assert.equal(run(root, 'approve', 'kept-promise', 'plan', '--by', 'tester').status, 0);
    commit(root, 'plan approved');

    const result = run(root, 'check', '--stage', 'commit');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// a-named-behaviour-is-a-link B4. The reminder about `supersedes:` used to be the last paragraph
// of the body, and an agent answered it there (F31). It now sits in the frontmatter as a comment
// the parser ignores, beside the line it is about.
test('the spec template carries its supersedes reminder in the frontmatter, and parse ignores it', async () => {
  const { parse } = await import('../.aidlc/lib/artifacts.mjs');
  const { readFileSync: read } = await import('node:fs');
  const path = await import('node:path');
  const template = read(path.join(A, 'templates', 'spec.md'), 'utf8');
  const { front, body } = parse(template);
  assert.deepEqual(front, { status: 'draft' });
  assert.match(template.split('\n---\n')[0], /supersedes:/, 'the reminder is in the frontmatter block');
  assert.doesNotMatch(body, /Reversing a behaviour an earlier approved spec claims/);
});

// an-edited-approval-awaits-its-gate B7. The template's frontmatter comment carries `<slug>`,
// and reading markers off the whole template file made every spec that mentions `<slug>` in its
// prose read as an unedited scaffold — including the spec that recorded this.
test('a placeholder in the template frontmatter is not a body marker', async () => {
  const { templateMarkers } = await import('../.aidlc/lib/artifacts.mjs');
  const body = '# Spec: x\n\n## Outcome\n\nReal.\n\n## Observable behaviours\n\n### B1\n\nGiven a thing\nWhen `harness approve <slug> spec` runs\nThen it is refused\n';
  assert.deepEqual(templateMarkers('spec', body), []);
});
