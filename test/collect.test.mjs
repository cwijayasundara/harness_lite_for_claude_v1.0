import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from './_paths.mjs';
import path from 'node:path';

const COLLECT = path.join(ROOT, 'examples', 'collect-ci-failure-rate.mjs');

test('collector prints empty bands and exits 0 when GitHub context is missing', () => {
  const env = { ...process.env };
  delete env.GITHUB_REPOSITORY;
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  const result = spawnSync(process.execPath, [COLLECT], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  const doc = JSON.parse(result.stdout);
  assert.deepEqual(doc.bands, []);
});

test('collector fail-opens to empty bands when gh api fails', () => {
  const result = spawnSync(process.execPath, [COLLECT], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: 'example/repo', GH_TOKEN: 'not-a-token', GITHUB_TOKEN: 'not-a-token', PATH: process.env.PATH },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).bands, []);
});
