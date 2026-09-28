import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, riskTier, DEFAULT_HIGH_RISK } from '../.claude/harness/lib/risk.mjs';

test('glob patterns match whole path segments', () => {
  assert.ok(globToRegExp('**/migrations/**').test('db/migrations/001_init.sql'));
  assert.ok(globToRegExp('**/migrations/**').test('migrations/001.sql'));
  assert.ok(!globToRegExp('**/auth/**').test('src/author.ts'));
  assert.ok(globToRegExp('**/*.sql').test('schema.sql'));
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'));
  assert.ok(globToRegExp('.github/workflows/**').test('.github/workflows/ci.yml'));
  assert.ok(!globToRegExp('a.b').test('axb'), 'a dot is a dot');
});

test('a change is high risk when any path matches, and it says which', () => {
  const cfg = { review: { high_risk: DEFAULT_HIGH_RISK } };
  assert.deepEqual(riskTier(cfg, ['src/calc.ts', 'tests/calc.test.ts']), { tier: 'low', matched: [] });
  assert.deepEqual(riskTier(cfg, ['src/calc.ts', 'db/migrations/002.sql']).matched,
    [{ file: 'db/migrations/002.sql', pattern: '**/migrations/**' }]);
  assert.equal(riskTier({}, ['src/auth/']).tier, 'high', 'a plan that claims a directory is judged by the claim');
  assert.equal(riskTier({ review: { high_risk: [] } }, ['db/migrations/1.sql']).tier, 'low', 'an empty list is a choice');
});
