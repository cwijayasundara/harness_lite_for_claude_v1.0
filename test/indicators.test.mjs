// The playbook indicators are a governance requirement, and they were computed from the
// pre-contract four-file chain the delivery contract replaced — so they printed `unmeasured`
// while real work went through the contract chain. These pin the contract-chain reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import { rows } from '../.aidlc/lib/contract-chain.mjs';
import { sealContract } from '../.aidlc/lib/contract.mjs';
import { playbookIndicators } from '../.aidlc/lib/indicators.mjs';

const TEMPLATE = path.join(ROOT, 'evals/fixtures/contract-planned/.aidlc/artifacts/contracts/hyphen-titlecase.md');
const REF = path.join(ROOT, 'evals/fixtures/contract-planned/.aidlc/artifacts/intent-refs/hyphen-titlecase.json');

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'chain-'));
  const L = {
    root,
    aidlc: path.join(root, '.aidlc'),
    intent: path.join(root, '.aidlc/artifacts/intent'),
    intentRefs: path.join(root, '.aidlc/artifacts/intent-refs'),
    contracts: path.join(root, '.aidlc/artifacts/contracts'),
    review: path.join(root, '.aidlc/artifacts/review'),
  };
  for (const d of [L.intent, L.intentRefs, L.contracts, L.review]) mkdirSync(d, { recursive: true });
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@harness');
  git('config', 'user.name', 'test');
  const commit = (m) => { git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', m); };
  return { root, L, cfg: { layout: L }, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// Walks a change through the chain: intent -> committed acceptance -> spec seal -> plan seal.
function change(r, id, { accept = true, commitAcceptance = true } = {}) {
  writeFileSync(path.join(r.L.intent, `${id}.md`), `# Intent: ${id}\n\n- **Status:** approved\n\n## Problem\n\nx\n`);
  const ref = JSON.parse(readFileSync(REF, 'utf8'));
  ref.id = id;
  // The fixture ref is already accepted — it has to be, or its contract could not have sealed.
  // Start from draft so that acceptance is a distinct, observable commit.
  ref.decision = { status: 'draft', decided_by: null, decided_at: null };
  writeFileSync(path.join(r.L.intentRefs, `${id}.json`), JSON.stringify(ref, null, 2));
  r.commit(`intent: ${id}`);

  const accepted = () => {
    ref.decision = { status: 'accepted', decided_by: 'test', decided_at: new Date().toISOString() };
    writeFileSync(path.join(r.L.intentRefs, `${id}.json`), JSON.stringify(ref, null, 2));
  };
  if (accept && commitAcceptance) { accepted(); r.commit(`acceptance: ${id}`); }

  const file = path.join(r.L.contracts, `${id}.md`);
  writeFileSync(file, readFileSync(TEMPLATE, 'utf8')
    .replace(/hyphen-titlecase/g, id)
    .replace(/^- \*\*Spec status:\*\*.*$/m, '- **Spec status:** draft')
    .replace(/^- \*\*Spec approval digest:\*\*.*$/m, '- **Spec approval digest:** pending')
    .replace(/^- \*\*Plan status:\*\*.*$/m, '- **Plan status:** draft')
    .replace(/^- \*\*Plan approval digest:\*\*.*$/m, '- **Plan approval digest:** pending'));
  r.commit(`contract: ${id}`);
  sealContract(file, 'spec'); r.commit(`spec seal: ${id}`);
  sealContract(file, 'plan'); r.commit(`plan seal: ${id}`);
  // Last, and deliberately uncommitted: any r.commit() after this would `git add -A` it back in,
  // which is exactly the mistake that made the first version of the B2 test pass for free.
  if (accept && !commitAcceptance) accepted();
  return file;
}

function review(r, id, status, { viaChangesRequested = false } = {}) {
  const file = path.join(r.L.review, `${id}.md`);
  if (viaChangesRequested) {
    writeFileSync(file, `# Review: ${id}\n\n- **Status:** changes-requested\n`);
    r.commit(`review: ${id} changes-requested`);
  }
  writeFileSync(file, `# Review: ${id}\n\n- **Status:** ${status}\n`);
  r.commit(`review: ${id} ${status}`);
}

// B1
test('a completed chain reports a value for every indicator', () => {
  const r = repo(); try {
    change(r, 'alpha');
    review(r, 'alpha', 'approved');
    const p = playbookIndicators(r.cfg, rows(r.cfg));
    assert.equal(p.intent_survival.approved, 1);
    assert.equal(p.intent_survival.rate, 1);
    assert.notEqual(p.intent_commit_hours.mean, null, 'time to committed intent');
    assert.notEqual(p.spec_rework_after_plan.mean, null, 'spec rework after plan');
    assert.equal(p.first_pass_review.rate, 1, 'first-pass review');
  } finally { r.cleanup(); }
});

// B2. The rule lifecycle.mjs enforced, carried over: an approval sitting in a working tree is
// not an auditable gate.
test('an accepted intent whose acceptance was never committed does not count', () => {
  const r = repo(); try {
    change(r, 'beta', { commitAcceptance: false });
    const [row] = rows(r.cfg);
    assert.equal(row.intent.status, 'accepted', 'the working tree says accepted');
    assert.equal(row.intent.accepted_at, null, 'but no commit carries it');
    assert.equal(playbookIndicators(r.cfg, rows(r.cfg)).intent_survival.approved, 0);
  } finally { r.cleanup(); }
});

// B3. Spec and plan are sections of one file, so rework is a digest that moved after the plan
// seal — not a commit that touched a second file, which counted typo fixes as rework.
test('a spec digest that changes after the plan seal is rework', () => {
  const r = repo(); try {
    const file = change(r, 'gamma');
    // Reopen the spec, alter it, re-seal: the digest moves.
    writeFileSync(file, readFileSync(file, 'utf8')
      .replace(/^- \*\*Spec status:\*\*.*$/m, '- **Spec status:** draft')
      .replace(/^- \*\*Spec approval digest:\*\*.*$/m, '- **Spec approval digest:** pending')
      .replace('## Outcome', '## Outcome\n\nReworked after the plan was sealed.\n'));
    sealContract(file, 'spec');
    r.commit('spec re-seal: gamma');
    assert.equal(rows(r.cfg)[0].contract.spec_rework_after_plan, 1);
  } finally { r.cleanup(); }
});

// B4
test('a spec untouched after the plan seal counts zero rework', () => {
  const r = repo(); try {
    change(r, 'delta');
    assert.equal(rows(r.cfg)[0].contract.spec_rework_after_plan, 0);
  } finally { r.cleanup(); }
});

// B5
test('a review that ever requested changes is not a first-pass approval', () => {
  const r = repo(); try {
    change(r, 'epsilon');
    review(r, 'epsilon', 'approved', { viaChangesRequested: true });
    change(r, 'zeta');
    review(r, 'zeta', 'approved');
    const p = playbookIndicators(r.cfg, rows(r.cfg));
    assert.equal(p.first_pass_review.total, 2);
    assert.equal(p.first_pass_review.first_pass, 1, 'only zeta passed first time');
    assert.equal(p.first_pass_review.rate, 0.5);
  } finally { r.cleanup(); }
});

// B6. Absence of work is not a failure, and it is not a zero either.
test('a repository with no contracts reports unmeasured, not zero', () => {
  const r = repo(); try {
    assert.deepEqual(rows(r.cfg), []);
    const p = playbookIndicators(r.cfg, rows(r.cfg));
    assert.equal(p.intent_survival.rate, null);
    assert.equal(p.intent_commit_hours.mean, null);
    assert.equal(p.spec_rework_after_plan.mean, null);
    assert.equal(p.first_pass_review.rate, null);
  } finally { r.cleanup(); }
});
