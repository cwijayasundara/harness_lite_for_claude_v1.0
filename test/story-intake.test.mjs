// G08. `harness new --from <document>` turns a PRD or a tracker story into a change, and
// `--split` turns one with several stories into a decomposed set.
//
// The kernel reads a path or takes a URL string, and nothing else: a tracker read is performed by
// the agent through the project's own MCP server and written to a file, so no tracker client, no
// credential and no network call enters the kernel, and the document a change was decomposed from
// is a committed artifact a reviewer can read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';
import * as intake from '../.aidlc/lib/intake.mjs';
import { coordination } from '../.aidlc/lib/coordination.mjs';
import { BIN } from './_paths.mjs';

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });
const commit = (root, message) => {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
};

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'intake-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

// Three stories, and the third says what it comes after. The order is in the document a person
// wrote, not in a flag somebody has to remember to pass.
const PRD = `# Partial payments

Customers pay invoices in instalments and the balance shown must agree everywhere.

## Story: Shared credit rule

A payment credits its amount minus its fee.

## Story: Portal balance

The customer portal shows the outstanding balance using the shared credit rule.

Depends on: Shared credit rule

## Story: Finance report

The finance report shows the outstanding balance using the shared credit rule.

Depends on: Shared credit rule, Portal balance
`;

test('a PRD with three stories yields three child changes with parent and stated dependencies', () => {
  const root = repo();
  try {
    writeFileSync(path.join(root, 'prd.md'), PRD);
    const revision = commit(root, 'the product brief');

    const out = run(root, 'new', '--from', 'prd.md', '--split');
    assert.equal(out.status, 0, out.stderr);

    const cfg = loadConfig(root);
    const slugs = ['shared-credit-rule', 'portal-balance', 'finance-report'];
    assert.deepEqual(a.slugs(cfg).sort(), [...slugs].sort());

    for (const slug of slugs) {
      const intent = a.read(cfg, slug, 'intent');
      // Every child names the same initiative, which is what groups them in `coordination()`.
      assert.equal(intent.front.parent, 'partial-payments', slug);
      // And the same source at the same exact revision, which is what makes the grouping a
      // claim about one document rather than three coincidences.
      assert.equal(intent.front.source, 'prd.md', slug);
      assert.equal(intent.front.source_revision, revision, slug);
      // The story's own text, not a placeholder: the change says what it is for.
      assert.match(intent.body, /^# Intent: /m);
      assert.ok(existsSync(a.file(cfg, slug, 'spec')), `${slug} is a full change, not just an intent`);
      assert.ok(existsSync(a.file(cfg, slug, 'plan')));
    }

    assert.match(a.read(cfg, 'portal-balance', 'intent').body, /customer portal shows the outstanding balance/);

    // The order the PRD stated, on the plan, where `coordinationDeclarations` already reads it.
    assert.equal(a.read(cfg, 'shared-credit-rule', 'plan').front.depends_on, undefined,
      'the first story depends on nothing and says nothing');
    assert.equal(a.read(cfg, 'portal-balance', 'plan').front.depends_on, 'shared-credit-rule');
    assert.equal(a.read(cfg, 'finance-report', 'plan').front.depends_on, 'shared-credit-rule, portal-balance');

    // Exactly the shape the existing declaration parser accepts — no second format.
    assert.deepEqual(a.coordinationDeclarations('plan', a.read(cfg, 'finance-report', 'plan').text).dependsOn,
      ['shared-credit-rule', 'portal-balance']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('harness status shows the decomposition', () => {
  const root = repo();
  try {
    writeFileSync(path.join(root, 'prd.md'), PRD);
    commit(root, 'the product brief');
    assert.equal(run(root, 'new', '--from', 'prd.md', '--split').status, 0);
    commit(root, 'the decomposed changes');

    const status = run(root, 'status');
    assert.equal(status.status, 0, status.stdout + status.stderr);
    for (const slug of ['shared-credit-rule', 'portal-balance', 'finance-report']) {
      assert.match(status.stdout, new RegExp(slug), `status does not list ${slug}`);
    }

    // The grouping and the edges are computed, not printed from a second store.
    const team = coordination(loadConfig(root));
    const parent = team.parents.find((p) => p.parent === 'partial-payments');
    assert.ok(parent, JSON.stringify(team.parents));
    assert.equal(parent.children.length, 3);
    const edge = team.dependencies.find((d) => d.change === 'portal-balance');
    assert.equal(edge.prerequisite, 'shared-credit-rule');
    assert.equal(edge.status, 'declared');
    assert.deepEqual(team.cycles, [], 'a stated order must not describe a cycle');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('without --split one document is one change, and a URL is recorded rather than fetched', () => {
  const root = repo();
  try {
    writeFileSync(path.join(root, 'prd.md'), PRD);
    const revision = commit(root, 'the product brief');

    assert.equal(run(root, 'new', '--from', 'prd.md').status, 0);
    const cfg = loadConfig(root);
    assert.deepEqual(a.slugs(cfg), ['partial-payments']);
    assert.equal(a.read(cfg, 'partial-payments', 'intent').front.source_revision, revision);
    assert.equal(a.read(cfg, 'partial-payments', 'intent').front.parent, undefined,
      'a single change has no initiative to belong to');

    // A URL is a string the kernel records. Nothing here opens a socket: this URL does not
    // resolve, and the command still succeeds.
    const url = 'https://tracker.example.invalid/issues/7';
    const out = run(root, 'new', 'billing-timeout', '--from', url, '--revision', 'rev-42');
    assert.equal(out.status, 0, out.stderr);
    const tracked = a.read(loadConfig(root), 'billing-timeout', 'intent');
    assert.equal(tracked.front.source, url);
    assert.equal(tracked.front.source_revision, 'rev-42');
    assert.match(tracked.body, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an origin the approval could not bind is recorded in prose and said out loud', () => {
  const root = repo();
  try {
    commit(root, 'empty repository');
    writeFileSync(path.join(root, 'draft-prd.md'), '# Uncommitted brief\n\nSomething should change.\n');

    // Uncommitted: G07 refuses a half-declaration, so writing `source` with no resolvable
    // revision would produce an intent that cannot be approved. It records the origin in prose
    // and names what to do instead.
    const out = run(root, 'new', '--from', 'draft-prd.md');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /not committed/);
    const intent = a.read(loadConfig(root), 'uncommitted-brief', 'intent');
    assert.equal(intent.front.source, undefined);
    assert.equal(intent.front.source_revision, undefined);
    assert.match(intent.body, /draft-prd\.md/);

    // Same rule for a URL with no revision to pin.
    const noRevision = run(root, 'new', 'ticket-99', '--from', 'https://tracker.example.invalid/issues/99');
    assert.equal(noRevision.status, 0, noRevision.stderr);
    assert.match(noRevision.stdout, /--revision/);
    assert.equal(a.read(loadConfig(root), 'ticket-99', 'intent').front.source, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a document that states an order nothing matches says so instead of dropping it', () => {
  const root = repo();
  try {
    writeFileSync(path.join(root, 'prd.md'), `# Two things

## Story: First thing

Do the first thing.

## Story: Second thing

Do the second thing.

Depends on: A story that does not exist
`);
    commit(root, 'brief with a dangling order');

    const out = run(root, 'new', '--from', 'prd.md', '--split');
    assert.equal(out.status, 0, out.stderr);
    // Reported, never silently dropped: an order the tool ignored is worse than no order.
    assert.match(out.stdout, /UNRESOLVED/);
    assert.match(out.stdout, /names no other story in this document/);
    assert.equal(a.read(loadConfig(root), 'second-thing', 'plan').front.depends_on, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an acceptance-criteria table decomposes when it is grouped and no stories are declared', () => {
  const cfg = { layout: { root: process.cwd(), artifacts: 'unused' } };
  const document = `# Invoice balances

## Acceptance criteria

| Criterion ID | Criterion |
|---|---|
| portal:balance | The portal shows the outstanding balance. |
| portal:refresh | The portal refreshes after a payment. |
| report:balance | The report shows the outstanding balance. |
`;
  const decision = intake.plan(cfg, { from: 'https://example.invalid/doc', split: true, revision: 'r1', text: document });
  assert.deepEqual(decision.changes.map((c) => c.slug), ['portal', 'report']);
  assert.ok(decision.changes.every((c) => c.parent === 'invoice-balances'));
  // The criteria travel into the change that owns them, so the spec has something to map.
  assert.match(decision.changes[0].body, /portal:refresh/);
  assert.doesNotMatch(decision.changes[0].body, /report:balance/);

  // An ungrouped table is one change, which is the right answer rather than an error.
  // No `<group>:` prefix anywhere: the table declares no grouping.
  const flat = document.replace(/portal:|report:/g, '');
  assert.throws(() => intake.plan(cfg, { from: 'https://example.invalid/doc', split: true, revision: 'r1', text: flat }),
    /nothing to split/);
});

test('intake refuses what it cannot read, and never writes outside the repository', () => {
  const root = repo();
  try {
    commit(root, 'empty repository');
    const missing = run(root, 'new', '--from', 'no-such-file.md');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /no such document/);

    const outside = run(root, 'new', '--from', '../escape.md');
    assert.equal(outside.status, 1);
    assert.match(outside.stderr, /outside the repository/);

    // A URL carrying credentials is refused rather than written into a committed artifact.
    const creds = run(root, 'new', 'leaky', '--from', 'https://user:secret@tracker.example.invalid/1', '--revision', 'r1');
    assert.equal(creds.status, 1);
    assert.match(creds.stderr, /credentials/);

    // A document with no stories is not silently one change when --split was asked for.
    writeFileSync(path.join(root, 'flat.md'), '# Flat\n\nNo stories here.\n');
    commit(root, 'a flat document');
    const flat = run(root, 'new', '--from', 'flat.md', '--split');
    assert.equal(flat.status, 1);
    assert.match(flat.stderr, /nothing to split/);

    assert.deepEqual(a.slugs(loadConfig(root)), [], 'nothing was written by any refusal');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('slugify produces slugs every other part of the harness accepts', () => {
  for (const [input, expected] of [
    ['Shared credit rule', 'shared-credit-rule'],
    ['  Portal  Balance  ', 'portal-balance'],
    ['Story 1: Do the thing!', 'story-1-do-the-thing'],
    ['Ünïcödé — dashes', 'n-c-d-dashes'],
    ['a'.repeat(80), 'a'.repeat(63)],
  ]) {
    const slug = intake.slugify(input);
    assert.equal(slug, expected, input);
    assert.match(slug, /^[a-z0-9][a-z0-9-]{0,62}$/, `${input} produced an unusable slug`);
  }
});
