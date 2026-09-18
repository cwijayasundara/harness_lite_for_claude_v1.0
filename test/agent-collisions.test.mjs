// G05. One harness per machine — or, failing that, a machine that says so.
//
// An agent is selected by name. Two installed plugins defining `evaluator` are two different sets
// of instructions answering to one name, and nothing in a run records which one answered. A
// campaign can obtain its "independent review" from a reviewer belonging to a different harness,
// and every number that run produces is then about something nobody meant to measure.
//
// MEASURED 2026-09-13: `harness-eng-v2@harness-eng-v2` v2.0.0 defines a bare `evaluator` on the
// machine this was developed on. The completion plan named `harness@harness-local` v0.3.1 as the
// problem; that one turned out to be namespaced already and collides with nothing, which is why
// this is detected rather than remembered.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { collisions, collisionLines, installedAgents, ourAgents } from '../.claude/harness/lib/agent-collisions.mjs';
import { A, BIN, ROOT } from './_paths.mjs';

// A plugin cache in the shape the real one has: <marketplace>/<plugin>/<version>/agents/*.md
function cache(entries) {
  const root = mkdtempSync(path.join(tmpdir(), 'plugin-cache-'));
  for (const [marketplace, plugin, version, agents] of entries) {
    const dir = path.join(root, marketplace, plugin, version, 'agents');
    mkdirSync(dir, { recursive: true });
    for (const name of agents) writeFileSync(path.join(dir, `${name}.md`), `---\nname: ${name}\ndescription: x\n---\n\nbody\n`);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('an installed plugin answering to one of our agent names is a collision', () => {
  const c = cache([
    ['other-market', 'other-harness', '2.0.0', ['evaluator', 'architect']],
    ['namespaced', 'tidy-harness', '0.3.1', ['harness-evaluator', 'harness-generator']],
  ]);
  try {
    assert.equal(installedAgents(c.root).length, 4);
    const found = collisions({ rolesDir: path.join(A, 'roles'), cacheDir: c.root });
    // Exactly the bare name, and not the namespaced ones — which is the difference between the
    // plugin the plan named and the plugin that was actually the problem.
    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'evaluator');
    assert.equal(found[0].plugin, 'other-harness');
    assert.equal(found[0].version, '2.0.0');

    const lines = collisionLines(found).join('\n');
    assert.match(lines, /COLLISION/);
    assert.match(lines, /"evaluator" is also defined by other-harness@other-market v2\.0\.0/);
    // It has to say why a name clash matters, or a reader files it as cosmetic.
    assert.match(lines, /selected by name/);
    assert.match(lines, /claude plugin uninstall/);
  } finally { c.cleanup(); }
});

test('our own plugin, installed, is not a collision with itself', () => {
  const c = cache([['mine', 'lean-harness-cs-v1', '0.1.0', ['evaluator', 'verifier']]]);
  try {
    assert.equal(collisions({ rolesDir: path.join(A, 'roles'), cacheDir: c.root }).length, 2,
      'without knowing which plugin is ours, every one of our own agents looks like a clash');
    assert.deepEqual(collisions({ rolesDir: path.join(A, 'roles'), cacheDir: c.root, self: 'lean-harness-cs-v1' }), []);
  } finally { c.cleanup(); }
});

test('a clean machine says so, and an unreadable cache is silence rather than an error', () => {
  const empty = cache([]);
  try {
    assert.deepEqual(collisions({ rolesDir: path.join(A, 'roles'), cacheDir: empty.root }), []);
    assert.match(collisionLines([])[0], /no installed plugin defines an agent by one of our names/);
  } finally { empty.cleanup(); }

  // Someone else's directory, and not ours to repair: a diagnostic that cannot read it reports
  // nothing and must never fail the command it is part of.
  assert.deepEqual(installedAgents(path.join(tmpdir(), 'does-not-exist-at-all')), []);
  assert.deepEqual(collisions({ rolesDir: path.join(tmpdir(), 'no-roles-here'), cacheDir: path.join(tmpdir(), 'nope') }), []);
});

test('our agent names come from the roles themselves, not a second list', () => {
  // Names live in one place. A hardcoded production registry would be a second list to drift.
  assert.deepEqual(ourAgents(path.join(A, 'roles')).sort(), ['evaluator', 'verifier']);
});

test('doctor reports the collision, and keeps the isolation the eval invoker relies on', () => {
  const out = spawnSync(process.execPath, [BIN, 'doctor'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out.stdout, /^agents /m, 'doctor says nothing about agent names');

  // The other half of G05's acceptance: what the suite measures must not depend on whose laptop
  // runs it, so the invoker keeps the fixture's own settings and nothing from the operator's home.
  assert.match(readFileSync(path.join(ROOT, 'evals/lib/invoker.mjs'), 'utf8'),
    /'--setting-sources', 'project,local'/);
});
