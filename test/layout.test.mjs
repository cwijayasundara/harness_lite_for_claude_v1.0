// The harness lives at .claude/harness/. This guards the one invariant a path rename can
// silently lose: a stray `.aidlc` reference that still resolves on a developer's disk because
// their untracked state directory survived, and fails for everyone else.
//
// Three paths keep their references and are exempt, for the same reason: they record what was
// true when they were written, not where the harness lives now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EXEMPT = [':!docs/history', ':!docs/superpowers', ':!test/layout.test.mjs'];

const grep = (...pathspec) => {
  try {
    return execFileSync('git', ['-C', ROOT, 'grep', '-I', '-l', '\\.aidlc', '--', ...pathspec],
      { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // git grep exits 1 on no match
    throw e;
  }
};

test('no tracked file outside the exempt paths references .aidlc', () => {
  assert.deepEqual(grep('.', ...EXEMPT), []);
});

test('the harness lives at .claude/harness and .aidlc is gone', () => {
  assert.ok(existsSync(path.join(ROOT, '.claude/harness/bin/harness')));
  assert.ok(!existsSync(path.join(ROOT, '.aidlc')));
});

test('historical artifacts keep their .aidlc references', () => {
  assert.equal(grep('docs/history').length, 238);
});

// This repository builds the harness; it does not run it (.claude/CLAUDE.md). Its own change
// records are history and live under docs/history/, so `.claude/harness/artifacts/` means here
// exactly what it means in a consumer project: empty until `harness new` writes the first change.
test('the harness tree carries no change records of its own', () => {
  assert.deepEqual(
    execFileSync('git', ['-C', ROOT, 'ls-files', '--', '.claude/harness/artifacts'], { encoding: 'utf8' })
      .split('\n').filter(Boolean), []);
});

test('the user-facing skill and agent directories stay free for the user', () => {
  for (const dir of ['.claude/skills', '.claude/agents']) {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) continue;
    assert.deepEqual(readdirSync(abs), [], `${dir} must stay empty`);
  }
});
