import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const C = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BIN = path.join(C, 'bin', 'harness');
const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function commit(root, message) {
  spawnSync('git', ['add', '.'], { cwd: root });
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
}

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'handoff-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  commit(root, 'init');
  return root;
}

function approve(root, kind, slug) {
  const file = path.join(root, '.claude/artifacts', kind, `${slug}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace('Status:** draft', 'Status:** approved'));
}

test('handoff ignores an approved intent that is not in git', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'intent', 'uncommitted-gate').status, 0);
    approve(root, 'intent', 'uncommitted-gate');
    const result = run(root, 'handoff', '--json');
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.actions.length, 0);
    assert.equal(existsSync(path.join(root, '.claude/artifacts/spec/uncommitted-gate.md')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('handoff --write creates a draft spec once from a committed approved intent', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'intent', 'faster-search').status, 0);
    approve(root, 'intent', 'faster-search');
    commit(root, 'approve intent');
    const dry = JSON.parse(run(root, 'handoff', '--json').stdout);
    assert.equal(dry.actions[0].to, 'spec');
    assert.equal(dry.actions[0].slug, 'faster-search');
    const written = run(root, 'handoff', '--write', '--json');
    assert.equal(written.status, 0, written.stderr);
    const spec = path.join(root, '.claude/artifacts/spec/faster-search.md');
    assert.equal(existsSync(spec), true);
    const text = readFileSync(spec, 'utf8');
    assert.match(text, /Status:\*\* draft/);
    assert.match(text, /intent\/faster-search/);
    const again = JSON.parse(run(root, 'handoff', '--write', '--json').stdout);
    assert.equal(again.created.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('handoff writes a plan from an approved spec and never a review', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'new', 'intent', 'hyphen-titlecase').status, 0);
    approve(root, 'intent', 'hyphen-titlecase');
    commit(root, 'intent');
    assert.equal(run(root, 'handoff', '--write').status, 0);
    approve(root, 'spec', 'hyphen-titlecase');
    commit(root, 'spec');
    const result = JSON.parse(run(root, 'handoff', '--write', '--json').stdout);
    assert.equal(result.created[0].kind, 'plan');
    assert.equal(existsSync(path.join(root, '.claude/artifacts/plan/hyphen-titlecase.md')), true);
    assert.equal(existsSync(path.join(root, '.claude/artifacts/review/hyphen-titlecase.md')), false);
    assert.equal(result.actions.some((a) => a.to === 'review'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
