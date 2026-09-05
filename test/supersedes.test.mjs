// a-spec-can-be-superseded. evidence.md F9: an agent found sprint 3 reversing a behaviour sprint 1
// approved, named the behaviour id, and had nowhere to record the finding — so it wrote a
// paragraph into a summary that was deleted with the tmpdir, and sprint 1's spec still reads
// approved and still describes behaviour the code no longer has.
//
// The fix is a `supersedes: <slug>#<behaviour-id>` link in the *superseding* spec's frontmatter.
// `supersededBy(cfg)` computes who points at what — the superseded spec's file is never touched,
// the same way `stale-approval` is computed rather than stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN } from './_paths.mjs';
import { parse, render, bodyDigest, read, supersededBy } from '../.aidlc/lib/artifacts.mjs';

const cfg = (root) => ({ layout: { root, artifacts: path.join(root, '.aidlc/artifacts') } });

// A spec as `supersededBy` reads it: no git, no CLI, just the files on disk — the same shape
// `test/scope-drift.test.mjs` uses for a plan. `front.supersedes` is set before approval, exactly
// where a human approving the file would find it.
function writeSpec(root, slug, body, { front = {}, approved = true } = {}) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
  const file = path.join(dir, 'spec.md');
  const draft = render({ status: 'draft', ...front }, body);
  writeFileSync(file, draft);
  if (approved) {
    writeFileSync(file, render({ ...front, status: 'approved', by: 'tester', at: '2026-09-01T00:00:00.000Z', digest: bodyDigest(draft) }, body));
  }
  return file;
}

function tmp() { return mkdtempSync(path.join(tmpdir(), 'harness-supersedes-')); }

// B1: a link recorded in an approved spec is reported, keyed by the superseded `<slug>#<id>`.
test('supersededBy reports a link recorded in an approved spec', () => {
  const root = tmp();
  try {
    writeSpec(root, 'ledger', '# Spec: ledger\n\n## Observable behaviours\n\n### B2\n\nGiven ...\nWhen ...\nThen ...\n');
    writeSpec(root, 'evolves', '# Spec: evolves\n\n## Observable behaviours\n\n### B1\n\nGiven ...\nWhen ...\nThen ...\n', { front: { supersedes: 'ledger#B2' } });

    const map = supersededBy(cfg(root));
    assert.deepEqual(map.get('ledger#B2'), ['evolves']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B5: supersession takes effect only when the superseding spec is itself approved. A behaviour is
// retired by a human's gate, not by an agent writing a line in a draft.
test('a supersedes: link in a draft spec supersedes nothing', () => {
  const root = tmp();
  try {
    writeSpec(root, 'ledger', '# Spec: ledger\n\n## Observable behaviours\n\n### B2\n\nGiven ...\nWhen ...\nThen ...\n');
    writeSpec(root, 'evolves', '# Spec: evolves\n\n## Observable behaviours\n\n### B1\n\nGiven ...\nWhen ...\nThen ...\n', { front: { supersedes: 'ledger#B2' }, approved: false });

    const map = supersededBy(cfg(root));
    assert.equal(map.has('ledger#B2'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B3: the superseded artifact is never touched. Its file is byte-identical afterwards, and it
// still reports `approved` rather than `stale-approval` — the whole reason the state is computed.
test('the superseded spec.md is byte-identical after supersession takes effect, and stays approved', () => {
  const root = tmp();
  try {
    const ledgerFile = writeSpec(root, 'ledger', '# Spec: ledger\n\n## Observable behaviours\n\n### B2\n\nGiven ...\nWhen ...\nThen ...\n');
    const before = readFileSync(ledgerFile);

    writeSpec(root, 'evolves', '# Spec: evolves\n\n## Observable behaviours\n\n### B1\n\nGiven ...\nWhen ...\nThen ...\n', { front: { supersedes: 'ledger#B2' } });
    const map = supersededBy(cfg(root));
    assert.deepEqual(map.get('ledger#B2'), ['evolves']);

    assert.deepEqual(readFileSync(ledgerFile), before, 'the superseded file must not change');
    const state = read(cfg(root), 'ledger', 'spec');
    assert.equal(state.state, 'approved');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- B2: the declaration is checked at approval time. CLI-driven, like test/gate-content.test.mjs
// — `approve()`'s content checks only run through the real command, against committed files.

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-supersedes-cli-'));
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

// A real, non-scaffold spec, as in test/gate-content.test.mjs — one `### B<n>` per id, none of it
// template prose, so a supersedes: refusal is never confused with the placeholder refusal (B1).
function realSpec(ids, front = {}) {
  const behaviours = ids.map((id) => `### ${id}\n\nGiven a real precondition for ${id}\nWhen the matching action happens\nThen a real, specific result follows\n`).join('\n');
  const body = `# Spec: demo\n\n## Outcome\n\nA concrete, observable result stated in the language of the affected user.\n\n## Observable behaviours\n\n${behaviours}\n## Out of scope\n\nEverything not named above.\n\n## Safeguards\n\nNone beyond what the behaviours already state.\n`;
  return render({ status: 'draft', ...front }, body);
}

test('approve refuses a supersedes: link naming a slug with no spec.md', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'evolves-unknown').status, 0);
    writeFileSync(specPath(root, 'evolves-unknown'), realSpec(['B1'], { supersedes: 'nowhere#B1' }));
    commit(root, 'evolves-unknown drafted');

    const result = run(root, 'approve', 'evolves-unknown', 'spec', '--by', 'tester');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /supersedes: nowhere#B1/);
    assert.match(result.stderr, /nowhere/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('approve refuses a supersedes: link naming a spec that is not approved', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'ledger').status, 0);
    writeFileSync(specPath(root, 'ledger'), realSpec(['B2']));
    commit(root, 'ledger drafted, left unapproved');

    assert.equal(run(root, 'new', 'evolves-draft').status, 0);
    writeFileSync(specPath(root, 'evolves-draft'), realSpec(['B1'], { supersedes: 'ledger#B2' }));
    commit(root, 'evolves-draft drafted');

    const result = run(root, 'approve', 'evolves-draft', 'spec', '--by', 'tester');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /supersedes: ledger#B2/);
    assert.match(result.stderr, /not approved/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('approve refuses a supersedes: link naming a behaviour absent from the named spec', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'ledger').status, 0);
    writeFileSync(specPath(root, 'ledger'), realSpec(['B1']));
    commit(root, 'ledger drafted');
    assert.equal(run(root, 'approve', 'ledger', 'spec', '--by', 'tester').status, 0);
    commit(root, 'ledger spec approved');

    assert.equal(run(root, 'new', 'evolves-missing-id').status, 0);
    writeFileSync(specPath(root, 'evolves-missing-id'), realSpec(['B1'], { supersedes: 'ledger#B9' }));
    commit(root, 'evolves-missing-id drafted');

    const result = run(root, 'approve', 'evolves-missing-id', 'spec', '--by', 'tester');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /supersedes: ledger#B9/);
    assert.match(result.stderr, /B9/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('approve accepts a supersedes: link naming an approved spec and a behaviour id that exists', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'ledger').status, 0);
    writeFileSync(specPath(root, 'ledger'), realSpec(['B2']));
    commit(root, 'ledger drafted');
    assert.equal(run(root, 'approve', 'ledger', 'spec', '--by', 'tester').status, 0);
    commit(root, 'ledger spec approved');

    assert.equal(run(root, 'new', 'evolves').status, 0);
    writeFileSync(specPath(root, 'evolves'), realSpec(['B1'], { supersedes: 'ledger#B2' }));
    commit(root, 'evolves drafted');

    const result = run(root, 'approve', 'evolves', 'spec', '--by', 'tester');
    assert.equal(result.status, 0, result.stderr);
    const front = parse(readFileSync(specPath(root, 'evolves'), 'utf8')).front;
    assert.equal(front.supersedes, 'ledger#B2');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- B4: a reader can tell, through `harness status` and through `SessionStart`.

function ledgerAndEvolves(root) {
  assert.equal(run(root, 'new', 'ledger').status, 0);
  writeFileSync(specPath(root, 'ledger'), realSpec(['B2']));
  commit(root, 'ledger drafted');
  assert.equal(run(root, 'approve', 'ledger', 'spec', '--by', 'tester').status, 0);
  commit(root, 'ledger spec approved');

  assert.equal(run(root, 'new', 'evolves').status, 0);
  writeFileSync(specPath(root, 'evolves'), realSpec(['B1'], { supersedes: 'ledger#B2' }));
  commit(root, 'evolves drafted');
  assert.equal(run(root, 'approve', 'evolves', 'spec', '--by', 'tester').status, 0);
  commit(root, 'evolves spec approved');
}

test('harness status names a superseded behaviour and what superseded it', () => {
  const root = repo();
  try {
    ledgerAndEvolves(root);
    const status = run(root, 'status', '--all');
    assert.equal(status.status, 0, status.stdout + status.stderr);
    assert.match(status.stdout, /ledger#B2/);
    assert.match(status.stdout, /evolves/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// evidence.md F6: a notice that only speaks when asked never reached an agent that began working
// immediately. SessionStart pushes the same fact whether or not the agent goes looking.
test('SessionStart carries the same superseded fact', () => {
  const root = repo();
  try {
    ledgerAndEvolves(root);
    const r = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], { cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root }) });
    assert.equal(r.status, 0, r.stderr);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /ledger#B2/);
    assert.match(ctx, /evolves/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
