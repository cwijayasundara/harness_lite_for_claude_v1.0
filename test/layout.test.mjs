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
const EXEMPT = [':!.claude/harness/artifacts', ':!docs/superpowers', ':!test/layout.test.mjs'];

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
  assert.equal(grep('.claude/harness/artifacts').length, 238);
});

test('the user-facing skill and agent directories stay free for the user', () => {
  for (const dir of ['.claude/skills', '.claude/agents']) {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) continue;
    assert.deepEqual(readdirSync(abs), [], `${dir} must stay empty`);
  }
});
