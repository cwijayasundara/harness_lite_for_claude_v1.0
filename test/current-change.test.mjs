// a-diff-belongs-to-one-change. evidence.md F10 and F26: three instances of ownership answering
// "is this path claimed?" when the question was "is it claimed by the change being made?". The
// current change is the open change whose spec was approved most recently, and its approved
// committed plan is the only plan that governs a product write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN } from './_paths.mjs';
import { render, bodyDigest, currentChange, governingPlans } from '../.aidlc/lib/artifacts.mjs';

const cfg = (root) => ({ layout: { root, artifacts: path.join(root, '.aidlc/artifacts') } });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-current-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  return root;
}

function commit(root, message) {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
}

const approved = (body, at) => {
  const draft = render({ status: 'draft' }, body);
  return render({ status: 'approved', by: 'tester', at, digest: bodyDigest(draft) }, body);
};

// A change as the harness would leave it after each gate. `specAt` is the approval timestamp
// that decides which open change is current; `plan` is `approved`, `draft`, or `absent`.
function change(root, slug, { closed = false, spec = 'approved', specAt = '2026-09-01T00:00:00.000Z', plan = 'approved', owns = [`src/${slug}.mjs`] } = {}) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'intent.md'), `---\nstatus: ${closed ? 'closed' : 'draft'}\n---\n# Intent: ${slug}\n`);
  const specBody = `# Spec: ${slug}\n\n## Observable behaviours\n\n### B1\n\nGiven, when, then.\n`;
  if (spec === 'approved') writeFileSync(path.join(dir, 'spec.md'), approved(specBody, specAt));
  else if (spec === 'draft') writeFileSync(path.join(dir, 'spec.md'), render({ status: 'draft' }, specBody));
  const planBody = `# Plan: ${slug}\n\n## Files\n\n${owns.map((f) => `- \`${f}\``).join('\n')}\n`;
  if (plan === 'approved') writeFileSync(path.join(dir, 'plan.md'), approved(planBody, specAt));
  else if (plan === 'draft') writeFileSync(path.join(dir, 'plan.md'), render({ status: 'draft' }, planBody));
  commit(root, `${slug} written`);
}

// B1: the open change with the most recent approved spec is current; the rest are not.
test('the open change whose spec was approved most recently is current', () => {
  const root = repo();
  try {
    change(root, 'older', { specAt: '2026-09-01T00:00:00.000Z' });
    change(root, 'newer', { specAt: '2026-09-02T00:00:00.000Z' });
    const current = currentChange(cfg(root));
    assert.equal(current.slug, 'newer');
    assert.deepEqual(current.plan.owns, ['src/newer.mjs']);
    assert.deepEqual(governingPlans(cfg(root)).map((p) => p.slug), ['newer']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B1: a draft spec is never current, however new. Approving the spec is the act that makes a
// change the work now.
test('a draft spec is never current, and no approved open spec means no current change', () => {
  const root = repo();
  try {
    change(root, 'approved-old', { specAt: '2026-09-01T00:00:00.000Z' });
    change(root, 'drafted-new', { spec: 'draft', plan: 'absent' });
    assert.equal(currentChange(cfg(root)).slug, 'approved-old');

    const empty = repo();
    try {
      change(empty, 'only-draft', { spec: 'draft', plan: 'absent' });
      assert.equal(currentChange(cfg(empty)), null);
      assert.deepEqual(governingPlans(cfg(empty)), []);
    } finally { rmSync(empty, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B4: a closed change governs nothing. `lean-v2` was closed two days before its plan authorised
// an edit to a file its change had nothing to do with.
test('a closed change with the newest approval is not current and its plan is not returned', () => {
  const root = repo();
  try {
    change(root, 'live', { specAt: '2026-09-01T00:00:00.000Z' });
    change(root, 'finished', { closed: true, specAt: '2026-09-05T00:00:00.000Z' });
    const current = currentChange(cfg(root));
    assert.equal(current.slug, 'live');
    assert.deepEqual(governingPlans(cfg(root)).map((p) => p.slug), ['live']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B3's precondition: a current change whose plan is not approved is still current — it governs
// nothing, and that is the point. F26: sprint 3's plan was refused, and the write went ahead on
// sprint 2's authority.
test('a current change with no approved plan is current and governs no path', () => {
  const root = repo();
  try {
    change(root, 'sprint-2', { specAt: '2026-09-01T00:00:00.000Z' });
    change(root, 'sprint-3', { specAt: '2026-09-02T00:00:00.000Z', plan: 'draft' });
    const current = currentChange(cfg(root));
    assert.equal(current.slug, 'sprint-3');
    assert.equal(current.plan, null);
    assert.equal(current.planState, 'draft');
    assert.deepEqual(governingPlans(cfg(root)), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// B6: the fact is visible, in `status` and at SessionStart — F6 is why the hook is named.
test('harness status and SessionStart both name the current change and its plan state', () => {
  const root = repo();
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' }).status, 0);
    change(root, 'sprint-3', { specAt: '2026-09-02T00:00:00.000Z', plan: 'draft' });

    const status = spawnSync(process.execPath, [BIN, 'status'], { cwd: root, encoding: 'utf8' });
    assert.match(status.stdout, /current: sprint-3 — plan not approved/);

    const hook = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], { cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root }) });
    assert.equal(hook.status, 0, hook.stderr);
    assert.match(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext, /current: sprint-3 — plan not approved/);

    change(root, 'sprint-4', { specAt: '2026-09-03T00:00:00.000Z' });
    assert.match(spawnSync(process.execPath, [BIN, 'status'], { cwd: root, encoding: 'utf8' }).stdout, /current: sprint-4 \(plan approved\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// a-draft-is-a-declaration B2 and B4. F30: sprint 3 wrote a real spec, approved nothing, and
// edited product code under sprint 2's still-open plan. A filled-in draft spec is a declaration
// of work not yet gated; the scaffold `harness new` leaves is not.
const SCAFFOLD_B1 = 'Given ...\nWhen ...\nThen ...';
function draftSpec(root, slug, body) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'intent.md'), `---\nstatus: draft\n---\n# Intent: ${slug}\n`);
  writeFileSync(path.join(dir, 'spec.md'), render({ status: 'draft' }, `# Spec: ${slug}\n\n## Observable behaviours\n\n### B1\n\n${body}\n`));
  commit(root, `${slug} drafted`);
}

test('a filled-in draft spec awaits gate 1 and suspends every plan; a scaffold declares nothing', async () => {
  const { draftsAwaitingGate } = await import('../.aidlc/lib/artifacts.mjs');
  const root = repo();
  try {
    change(root, 'sprint-2', { specAt: '2026-09-02T00:00:00.000Z' });
    draftSpec(root, 'backlog-idea', SCAFFOLD_B1);
    assert.deepEqual(draftsAwaitingGate(cfg(root)), [], 'a scaffold is a backlog item');
    assert.deepEqual(governingPlans(cfg(root)).map((p) => p.slug), ['sprint-2']);

    draftSpec(root, 'sprint-3', 'Given a paid invoice\nWhen isOverdue is asked\nThen it answers false');
    assert.deepEqual(draftsAwaitingGate(cfg(root)).map((d) => d.slug), ['sprint-3']);
    assert.equal(currentChange(cfg(root)).slug, 'sprint-2', 'the current change does not move');
    assert.deepEqual(governingPlans(cfg(root)), [], 'but nothing governs while a declaration waits');

    const closed = path.join(root, '.aidlc/artifacts/sprint-3/intent.md');
    writeFileSync(closed, '---\nstatus: closed\n---\n# Intent: sprint-3\n');
    assert.deepEqual(draftsAwaitingGate(cfg(root)), [], 'closing lifts it');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('harness status and SessionStart name a draft awaiting gate 1', () => {
  const root = repo();
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' }).status, 0);
    change(root, 'sprint-2', { specAt: '2026-09-02T00:00:00.000Z' });
    draftSpec(root, 'sprint-3', 'Given a paid invoice\nWhen isOverdue is asked\nThen it answers false');
    const status = spawnSync(process.execPath, [BIN, 'status'], { cwd: root, encoding: 'utf8' });
    assert.match(status.stdout, /awaiting gate 1: sprint-3/);
    const hook = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], { cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root }) });
    assert.match(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext, /awaiting gate 1: sprint-3/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// an-edited-approval-awaits-its-gate B2, B3, B5. F32: sprint 3 appended behaviours to sprint 2's
// approved spec; the approval went stale, the stale spec was no longer current, and sprint 1's
// plan governed the write. An edited approval is a declaration that the promise changed.
test('an edited approved spec or plan on an open change awaits its gate and suspends every plan', async () => {
  const { draftsAwaitingGate } = await import('../.aidlc/lib/artifacts.mjs');
  const root = repo();
  try {
    change(root, 'sprint-1', { specAt: '2026-09-01T00:00:00.000Z', owns: ['src/ledger.mjs'] });
    change(root, 'sprint-2', { specAt: '2026-09-02T00:00:00.000Z', owns: ['src/ledger.mjs'] });
    const spec = path.join(root, '.aidlc/artifacts/sprint-2/spec.md');
    writeFileSync(spec, readFileSync(spec, 'utf8') + '\n### B8\n\nGiven a paid invoice\nWhen asked\nThen never overdue\n');
    assert.deepEqual(draftsAwaitingGate(cfg(root)), [{ slug: 'sprint-2', kind: 'spec', reason: 'stale' }]);
    assert.deepEqual(governingPlans(cfg(root)), [], 'sprint-1 must not govern in sprint-2\'s place');

    // Restore the approved text: the list empties and sprint-2 governs again.
    spawnSync('git', ['checkout', '--', '.aidlc/artifacts/sprint-2/spec.md'], { cwd: root });
    assert.deepEqual(draftsAwaitingGate(cfg(root)), []);
    assert.deepEqual(governingPlans(cfg(root)).map((p) => p.slug), ['sprint-2']);

    // An edited approved plan likewise, at gate 2.
    const plan = path.join(root, '.aidlc/artifacts/sprint-2/plan.md');
    writeFileSync(plan, readFileSync(plan, 'utf8') + '- `src/store.mjs`\n');
    assert.deepEqual(draftsAwaitingGate(cfg(root)), [{ slug: 'sprint-2', kind: 'plan', reason: 'stale' }]);
    assert.deepEqual(governingPlans(cfg(root)), []);
    spawnSync('git', ['checkout', '--', '.aidlc/artifacts/sprint-2/plan.md'], { cwd: root });

    // B3: a closed change's edited artifacts are history.
    change(root, 'finished', { closed: true, specAt: '2026-08-01T00:00:00.000Z' });
    const old = path.join(root, '.aidlc/artifacts/finished/spec.md');
    writeFileSync(old, readFileSync(old, 'utf8') + '\nnote added later\n');
    assert.deepEqual(draftsAwaitingGate(cfg(root)), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('harness status and SessionStart name an edited approval and its gate', () => {
  const root = repo();
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' }).status, 0);
    change(root, 'sprint-2', { specAt: '2026-09-02T00:00:00.000Z' });
    const spec = path.join(root, '.aidlc/artifacts/sprint-2/spec.md');
    writeFileSync(spec, readFileSync(spec, 'utf8') + '\nedited after approval\n');
    const status = spawnSync(process.execPath, [BIN, 'status'], { cwd: root, encoding: 'utf8' });
    assert.match(status.stdout, /awaiting gate 1: sprint-2 \(spec edited after approval\)/);
    const hook = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], { cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root }) });
    assert.match(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext, /awaiting gate 1: sprint-2 \(spec edited after approval\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
