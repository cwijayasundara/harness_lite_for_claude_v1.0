// Real Git observations in a disposable product; all fixture approvals are simulations.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { product, metadata, git, commit } from '../../../test/_coordination-product.mjs';
import { coordination } from '../../lib/coordination.mjs';
import * as a from '../../lib/artifacts.mjs';
const s = product();
try {
  for (const slug of ['text-contract', 'text-portal', 'text-report']) s.approve(slug);
  const baseline = coordination(s.cfg);
  assert.deepEqual(baseline.parents[0].unmapped, ['local:integration']);
  assert.equal(a.read(s.cfg, 'text-report', 'spec').front.extends, undefined);
  assert.equal(a.read(s.cfg, 'text-report', 'spec').front.supersedes, undefined);
  assert.equal(a.read(s.cfg, 'text-report', 'spec').state, 'approved');
  metadata(s.cfg, 'text-contract', 'plan', { depends_on: 'text-portal, missing' });
  metadata(s.cfg, 'text-portal', 'intent', { assignment_observed_at: '2026-09-08T10:00:00Z' });
  writeFileSync(`${s.work}/src/app/text.py`, '# Simulated shared interface revision requiring impact assessment\n');
  commit(s.work);
  const changed = coordination(s.cfg);
  assert.ok(changed.cycles.length);
  assert.ok(changed.dependencies.some(edge => edge.status === 'missing-target'));
  assert.equal(changed.dependencies.find(edge => edge.change === 'text-portal').interfaces[0].status, 'changed');
  assert.equal(a.currentChange(s.cfg).slug, 'hyphen-titlecase');
  assert.ok(a.currentChange(s.cfg).plan);
  const result = { fixture: 'contract-planned', simulated_approvals: true, fixture_sources_modified: false,
    repository_revision: git(process.cwd(), 'rev-parse', 'HEAD'), product_base: s.revision,
    product_candidate: git(s.work, 'rev-parse', 'HEAD'), independent_approval: 'approved without extends or supersedes',
    baseline, changed, limitation: 'Coordination acceptance only; child product implementations, remote assignments and integrated delivery are not claimed.' };
  writeFileSync('.aidlc/artifacts/decomposition-allocation/post-fix.json', JSON.stringify(result, null, 2) + '\n');
  console.log('PASS: three approved product children, source gap, independent approval, overlap, cycle, missing prerequisite, changed interface and unchanged selected authority');
} finally { s.cleanup(); }
