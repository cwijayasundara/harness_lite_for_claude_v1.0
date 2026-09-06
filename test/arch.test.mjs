// every-control-fires-or-goes B2. The architecture sensor's why: is a declared dependency
// direction — a lower layer must never import a higher one — and a kernel module must never
// import a provider projection. 76 invocations, zero fires, because nobody broke the rule. Break
// it, in a throwaway tree, and confirm the sensor is the thing that says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A } from './_paths.mjs';

const SENSOR = path.join(A, 'sensors', 'architecture.mjs');

function kernel(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-arch-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  }
  return root;
}

const run = (root) => spawnSync(process.execPath, [SENSOR], { cwd: root, encoding: 'utf8' });

test('a lower layer importing a higher one is a failing verdict that names both', () => {
  const root = kernel({
    '.aidlc/lib/config.mjs': "import { writeBlocked } from './guard.mjs';\nexport const x = writeBlocked;\n",
    '.aidlc/lib/guard.mjs': 'export const writeBlocked = () => null;\n',
  });
  try {
    const r = run(root);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /config\.mjs \(layer 1\) imports guard \(layer 3\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a kernel module importing a provider projection is a failing verdict', () => {
  const root = kernel({
    '.aidlc/lib/runner.mjs': "import { jira } from '../providers/jira.mjs';\nexport const r = jira;\n",
  });
  try {
    const r = run(root);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /runner\.mjs imports a provider projection/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dependencies that point down are clean, and the real kernel is', () => {
  const root = kernel({
    '.aidlc/lib/guard.mjs': "import { layout } from './paths.mjs';\nimport { governingPlans } from './artifacts.mjs';\nexport const g = [layout, governingPlans];\n",
    '.aidlc/lib/paths.mjs': 'export const layout = () => ({});\n',
    '.aidlc/lib/artifacts.mjs': 'export const governingPlans = () => [];\n',
  });
  try {
    assert.equal(run(root).status, 0, run(root).stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
  // The sensor names every kernel module in a layer, `artifacts` and `map` included. A module
  // in no layer is not checked, which is how `contract` stayed in the table after its deletion.
  const real = spawnSync(process.execPath, [SENSOR], { cwd: path.dirname(A), encoding: 'utf8' });
  assert.equal(real.status, 0, real.stderr);
});
