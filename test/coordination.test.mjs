import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { coordination, coordinationLines } from '../.aidlc/lib/coordination.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';
import { BIN } from './_paths.mjs';
import { product, metadata, edit, git, commit } from './_coordination-product.mjs';

const trial = fn => { const s = product(); try { fn(s); } finally { s.cleanup(); } };
test('three product children expose complete source inventory gaps and unknown mappings without accepting a parent', () => trial(s => {
  s.approve('text-contract');
  const history = a.read(s.cfg, 'hyphen-titlecase', 'spec').text;
  let r = coordination(s.cfg), parent = r.parents[0];
  assert.equal(parent.children.length, 3);
  assert.deepEqual(parent.unmapped, ['local:integration']);
  assert.deepEqual(parent.unknown, []);
  assert.equal(parent.mappings[0].spec.state, 'approved');
  assert.equal(parent.mappings[0].spec.binding, 'v2');
  assert.match(parent.coverage, /declared only/);
  edit(s.cfg, 'text-report', 'spec', text => text.replace('local:report', 'local:ghost'));
  for (const slug of parent.children) metadata(s.cfg, slug, 'intent', { status: 'closed' });
  r = coordination(s.cfg); parent = r.parents[0];
  assert.deepEqual(parent.unknown, ['local:ghost']);
  assert.deepEqual(parent.unmapped, ['local:report', 'local:integration']);
  assert.ok(parent.mappings.every(row => row.closed));
  assert.match(parent.coverage, /acceptance and delivery unverified/);
  assert.equal(a.read(s.cfg, 'hyphen-titlecase', 'spec').text, history);
  assert.equal(a.read(s.cfg, 'hyphen-titlecase', 'spec').binding, 'legacy/unbound');
}));

test('source inventories are read at exact commits and unavailable/malformed sources never fabricate coverage', () => trial(s => {
  writeFileSync(`${s.work}/initiative.md`, 'working copy should not change the inventory');
  assert.equal(coordination(s.cfg).parents[0].inventory.criteria.length, 4);
  commit(s.work);
  metadata(s.cfg, 'text-report', 'intent', { source_revision: git(s.work, 'rev-parse', 'HEAD') });
  let r = coordination(s.cfg);
  assert.equal(r.parents.length, 2);
  assert.equal(r.parents[1].inventory.status, 'coverage-unavailable');
  for (const source of ['https://example.invalid/parent', '../outside', '/tmp/outside', 'missing.md']) {
    metadata(s.cfg, 'text-report', 'intent', { source, source_revision: s.revision });
    const parent = coordination(s.cfg).parents.find(p => p.source === source);
    assert.equal(parent.inventory.status, 'coverage-unavailable'); assert.equal(parent.unmapped, null);
  }
  metadata(s.cfg, 'text-report', 'intent', { source: 'initiative.md', source_revision: 'HEAD' });
  assert.match(coordination(s.cfg).parents.find(p => p.source_revision === 'HEAD').inventory.reason, /exact commit/);
  assert.throws(() => a.coordinationTable('## Acceptance criteria\n\n| Criterion ID | Criterion |\n|---|---|\n| a | One |\nextra', 'Acceptance criteria', ['Criterion ID', 'Criterion']), /requires/);
}));

test('dependencies report absent targets, self-links, cycles and exact interface changes without delivery inference', () => trial(s => {
  let r = coordination(s.cfg);
  assert.equal(r.dependencies[0].interfaces[0].status, 'matches');
  assert.equal(r.dependencies[0].interfaces[0].ancestor, true);
  metadata(s.cfg, 'text-contract', 'plan', { depends_on: 'text-portal, missing, text-contract' });
  metadata(s.cfg, 'text-contract', 'intent', { status: 'closed' });
  r = coordination(s.cfg);
  assert.ok(r.cycles.some(cycle => cycle.join(',') === 'text-contract,text-portal,text-contract'));
  assert.ok(r.cycles.some(cycle => cycle.join(',') === 'text-contract,text-contract'));
  assert.ok(r.dependencies.some(edge => edge.status === 'missing-target'));
  assert.equal(r.dependencies.find(edge => edge.change === 'text-portal').delivery, 'unverified');
  writeFileSync(`${s.work}/src/app/text.py`, '# changed shared contract\n'); commit(s.work);
  assert.equal(coordination(s.cfg).dependencies.find(edge => edge.change === 'text-portal').interfaces[0].status, 'changed');
  unlinkSync(`${s.work}/src/app/text.py`); commit(s.work);
  assert.equal(coordination(s.cfg).dependencies.find(edge => edge.change === 'text-portal').interfaces[0].status, 'missing');
  edit(s.cfg, 'text-portal', 'plan', text => text.replace(s.revision, '0'.repeat(40)));
  assert.equal(coordination(s.cfg).dependencies.find(edge => edge.change === 'text-portal').interfaces[0].status, 'unavailable');
}));

test('interface equality without ancestry remains an integration assessment', () => trial(s => {
  const branch = git(s.work, 'branch', '--show-current');
  git(s.work, 'checkout', '-qb', 'interface-side'); commit(s.work);
  const side = git(s.work, 'rev-parse', 'HEAD');
  git(s.work, 'checkout', '-q', branch);
  edit(s.cfg, 'text-portal', 'plan', text => text.replace(s.revision, side));
  const row = coordination(s.cfg).dependencies[0].interfaces[0];
  assert.equal(row.matches, true); assert.equal(row.ancestor, false); assert.match(row.assessment, /impact assessment/);
}));

test('scope intersections use directory ownership, label drafts, exclude closed and never transfer authority', () => trial(s => {
  const before = a.currentChange(s.cfg);
  const r = coordination(s.cfg, { change: 'text-portal' });
  const overlap = r.overlaps.find(row => row.changes.includes('text-contract'));
  assert.deepEqual(overlap.intersections, ['src/app/text.py']);
  assert.equal(overlap.plans[0].state, 'draft');
  assert.deepEqual(a.currentChange(s.cfg), before);
  metadata(s.cfg, 'text-contract', 'intent', { status: 'closed' });
  assert.equal(coordination(s.cfg).overlaps.some(row => row.changes.includes('text-contract')), false);
  edit(s.cfg, 'text-report', 'plan', text => text.replace('src/report.py', 'src/app/text.py'));
  assert.ok(coordination(s.cfg).overlaps.some(row => row.changes.includes('text-report')));
  assert.match(coordinationLines(coordination(s.cfg, { change: 'nonexistent' })).join('\n'), /no local overlap.*remote conflicts unknown/);
}));

test('text and JSON status retain full-backlog relationships when filtered and label tracker freshness', () => trial(s => {
  metadata(s.cfg, 'text-portal', 'intent', { assignment_observed_at: '2026-09-08T10:00:00Z' });
  const cli = (...args) => execFileSync(process.execPath, [BIN, 'status', 'text-portal', ...args], { cwd: s.work, encoding: 'utf8' });
  const r = JSON.parse(cli('--json')).coordination;
  assert.equal(r.children.length, 1); assert.equal(r.parents[0].children.length, 3);
  assert.ok(r.overlaps.some(row => row.changes.includes('text-contract')));
  assert.equal(r.visibility.remote_prs, 'unavailable');
  assert.match(r.children[0].assignment.freshness, /unverified/);
  const text = cli();
  for (const phrase of ['text-portal-owner', 'sprint-1', '2026-09-08T10:00:00Z', 'local:integration', 'dependency', 'overlap', 'remote PR and assignment visibility unavailable']) assert.ok(text.includes(phrase), phrase);
  assert.equal(coordination(s.cfg).children.find(c => c.change === 'text-report').assignment.freshness, 'unknown');
}));

test('malformed dependencies refuse approval even with anyway; malformed backlog stays advisory', () => trial(s => {
  s.approve('text-contract');
  const original = a.read(s.cfg, 'text-contract', 'plan').text;
  for (const extra of ['depends_on: [text-portal]', 'depends_on: text-portal, text-portal', 'depends_on: ../escape', 'depends_on: text-portal\ndepends_on: text-report']) {
    writeFileSync(a.file(s.cfg, 'text-contract', 'plan'), original.replace('status: approved', `status: approved\n${extra}`));
    commit(s.work);
    assert.throws(() => a.approve(s.cfg, 'text-contract', 'plan', { by: 'simulation', anyway: 'test cannot waive malformed declarations' }), /scalar|depends_on/);
    assert.ok(coordination(s.cfg).findings.some(f => f.change === 'text-contract' && f.kind === 'dependency'));
    assert.ok(a.currentChange(s.cfg).plan, 'unrelated selected legacy product remains authorized');
  }
  for (const [body, pattern] of [
    ['## Dependencies\n\n| Change | Interface | Revision |\n|---|---|---|\n| ghost | src/app/text.py | ' + s.revision + ' |\n', /depends_on/],
    ['## Dependencies\n\nmalformed', /requires/],
  ]) assert.throws(() => a.coordinationDeclarations('plan', a.render({ status: 'draft' }, body)), pattern);
  metadata(s.cfg, 'text-report', 'intent', { assignment_observed_at: 'yesterday' });
  assert.ok(coordination(s.cfg).findings.some(f => /UTC ISO/.test(f.message)));
}));

test('new parent, allocation and interface metadata bind only their own approval chain', () => trial(s => {
  s.approve('text-contract'); s.approve('text-portal');
  const originalIntent = a.read(s.cfg, 'text-portal', 'intent').text;
  for (const values of [{ parent: 'TEXT-200' }, { assignee: 'new-owner' }, { iteration: 'sprint-2' }, { source_revision: '0'.repeat(40) }]) {
    metadata(s.cfg, 'text-portal', 'intent', values);
    assert.equal(a.read(s.cfg, 'text-portal', 'spec').state, 'stale-approval');
    assert.equal(a.read(s.cfg, 'text-portal', 'plan').state, 'stale-approval');
    assert.equal(a.read(s.cfg, 'text-contract', 'plan').state, 'approved');
    writeFileSync(a.file(s.cfg, 'text-portal', 'intent'), originalIntent);
  }
  const originalPlan = a.read(s.cfg, 'text-portal', 'plan').text;
  for (const replacement of [originalPlan.replace('depends_on: text-contract', 'depends_on: text-report'), originalPlan.replace(s.revision, '0'.repeat(40))]) {
    writeFileSync(a.file(s.cfg, 'text-portal', 'plan'), replacement);
    assert.equal(a.read(s.cfg, 'text-portal', 'plan').state, 'stale-approval');
    assert.equal(a.read(s.cfg, 'text-contract', 'plan').state, 'approved');
  }
}));
