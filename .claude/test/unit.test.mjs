// Zero dependencies, runs on a cold clone: node --test .claude/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseToml } from '../lib/toml.mjs';
import { resolveStage, DEFAULT_STAGES } from '../lib/config.mjs';
import { normalize } from '../lib/normalize.mjs';

test('toml: tables, types, arrays, comments', () => {
  const t = parseToml(`
# a comment
[project]
name = "acme"          # trailing comment
[capabilities]
lint = "ruff check --output-format=json {files}"
typecheck = ""
[stages]
fast = ["fmt", "lint"]
[budget]
ceiling = 4.0
soft = 140000
on = true
`);
  assert.equal(t.project.name, 'acme');
  assert.equal(t.capabilities.typecheck, '');
  assert.deepEqual(t.stages.fast, ['fmt', 'lint']);
  assert.equal(t.budget.ceiling, 4);
  assert.equal(t.budget.soft, 140000);
  assert.equal(t.budget.on, true);
});

test('toml: a # inside a quoted value is not a comment', () => {
  const t = parseToml('[a]\nb = "x # y"');
  assert.equal(t.a.b, 'x # y');
});

test('stages: one level of indirection resolves and de-duplicates', () => {
  const cfg = { stages: DEFAULT_STAGES };
  assert.deepEqual(resolveStage(cfg, 'fast'), ['fmt', 'lint', 'typecheck']);
  assert.deepEqual(resolveStage(cfg, 'stop'), ['fmt', 'lint', 'typecheck', 'test']);
});

test('stages: a cycle is an error, not a hang', () => {
  const cfg = { stages: { a: ['b'], b: ['a'] } };
  assert.throws(() => resolveStage(cfg, 'a'), /cycle/);
});

test('stages: an unknown stage names the ones that exist', () => {
  assert.throws(() => resolveStage({ stages: DEFAULT_STAGES }, 'nope'), /known: fast, stop/);
});

test('normalize: ruff json becomes the one finding schema', () => {
  const out = normalize('ruff', JSON.stringify([
    { filename: 'a.py', location: { row: 3 }, code: 'F401', message: 'unused import', fix: { message: 'remove it' } },
  ]), '', 1);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { file: 'a.py', line: 3, rule: 'F401', message: 'unused import', fix: 'remove it' });
});

test('normalize: eslint json flattens per-file messages', () => {
  const out = normalize('eslint', JSON.stringify([
    { filePath: '/x/a.js', messages: [{ line: 2, ruleId: 'no-var', message: 'no var' }] },
  ]), '', 1);
  assert.equal(out[0].rule, 'no-var');
});

test('normalize: an unparseable sensor can still say no', () => {
  const out = normalize('ruff', 'not json at all', 'boom on line 9', 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'harness/unparseable-output');
  assert.match(out[0].message, /boom on line 9/);
});

test('normalize: a generic tool exiting zero produces no findings', () => {
  assert.deepEqual(normalize('generic', 'all good', '', 0), []);
});

test('normalize: a generic tool exiting non-zero produces exactly one', () => {
  const out = normalize('generic', '', 'FAILED tests/test_a.py::test_b', 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'exit-nonzero');
});
