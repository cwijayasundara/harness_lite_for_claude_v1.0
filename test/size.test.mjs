import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { changedLines } from '../evals/lib/size.mjs';

test('changed lines split source from tests and ignore files outside the step', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'size-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    mkdirSync(path.join(root, 'src')); mkdirSync(path.join(root, 'tests'));
    writeFileSync(path.join(root, 'src/calc.mjs'), 'a\nb\n');
    git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'base');
    const from = git('rev-parse', 'HEAD');
    writeFileSync(path.join(root, 'src/calc.mjs'), 'a\nc\nd\n');      // -1 +2 = 3
    writeFileSync(path.join(root, 'tests/calc.test.mjs'), 'x\ny\n');  // +2
    writeFileSync(path.join(root, 'README.md'), 'outside\n');         // not in the step
    git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'step');
    const to = git('rev-parse', 'HEAD');
    assert.deepEqual(changedLines(root, from, to, ['src/calc.mjs', 'tests/calc.test.mjs']), { source: 3, test: 2 });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
