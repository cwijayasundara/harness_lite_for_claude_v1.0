import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN, ROOT } from './_paths.mjs';
import { contractDigest, validateContract, validateEvidence, validateIntentRef } from '../.aidlc/lib/contract.mjs';

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'contract-v1-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'contract@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'contract test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

function commit(root, message) {
  spawnSync('git', ['add', '-A'], { cwd: root });
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function acceptIntent(root, slug) {
  const file = path.join(root, `.aidlc/artifacts/intent-refs/${slug}.json`);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  value.source.revision = 'test-revision-17';
  value.decision = { status: 'accepted', decided_by: 'product-owner@example.invalid', decided_at: '2026-08-25T12:00:00.000Z' };
  value.snapshot_digest = `sha256:${'a'.repeat(64)}`;
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

test('intent refs declare exactly one authority and a reproducible source revision', () => {
  assert.deepEqual(validateIntentRef({ schema: 'aidlc.intent-ref/v1', id: 'PAY-1', source: { provider: 'jira', locator: 'PAY-1', revision: '17', authority: 'external' }, decision: { status: 'accepted', decided_by: 'owner@example.invalid', decided_at: '2026-08-25T12:00:00.000Z' }, snapshot_digest: `sha256:${'a'.repeat(64)}` }), []);
  assert.match(validateIntentRef({ schema: 'aidlc.intent-ref/v1', id: 'x', source: { provider: 'jira', locator: 'x', revision: '', authority: 'both' }, decision: { status: 'accepted' }, snapshot_digest: 'nope' }).join('\n'), /authority must be external or git/);
  assert.match(validateIntentRef({ schema: 'aidlc.intent-ref/v1', id: 'x', source: { provider: 'git', locator: 'x', revision: 'working-tree', authority: 'git' }, decision: { status: 'accepted' }, snapshot_digest: 'pending' }).join('\n'), /immutable snapshot digest/);
});

test('intent acceptance is a supported, attributable, immutable transition', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'new', 'accepted-change').status, 0);
    const digest = `sha256:${'b'.repeat(64)}`;
    const accepted = run(root, 'contract', 'accept', 'accepted-change', '--by', 'owner@example.invalid', '--revision', 'abc123', '--snapshot-digest', digest);
    assert.equal(accepted.status, 0, accepted.stderr);
    const value = JSON.parse(readFileSync(path.join(root, '.aidlc/artifacts/intent-refs/accepted-change.json'), 'utf8'));
    assert.equal(value.decision.status, 'accepted');
    assert.equal(value.decision.decided_by, 'owner@example.invalid');
    assert.equal(value.snapshot_digest, digest);
    assert.equal(run(root, 'contract', 'seal', 'accepted-change', '--scope', 'spec').status, 1, 'uncommitted acceptance cannot cross the gate');
    assert.equal(run(root, 'contract', 'accept', 'accepted-change', '--by', 'other@example.invalid', '--revision', 'def456', '--snapshot-digest', digest).status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('default contract creation does not create legacy spec or plan artifacts', () => {
  const root = repo();
  try {
    const result = run(root, 'contract', 'new', 'safe-change', '--provider', 'jira', '--locator', 'PAY-142', '--revision', '17', '--authority', 'external');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(path.join(root, '.aidlc/artifacts/contracts/safe-change.md')));
    assert.ok(existsSync(path.join(root, '.aidlc/artifacts/intent-refs/safe-change.json')));
    assert.equal(existsSync(path.join(root, '.aidlc/artifacts/spec/safe-change.md')), false);
    assert.equal(run(root, 'contract', 'validate', 'safe-change').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('contract creation refuses either-side collisions without overwriting provenance', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'new', 'collision').status, 0);
    const ref = path.join(root, '.aidlc/artifacts/intent-refs/collision.json');
    const before = readFileSync(ref, 'utf8');
    assert.equal(run(root, 'contract', 'new', 'collision', '--provider', 'jira').status, 2);
    assert.equal(readFileSync(ref, 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('spec and plan approval digests become stale when their governed surface changes', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'new', 'digest-change').status, 0);
    const file = path.join(root, '.aidlc/artifacts/contracts/digest-change.md');
    assert.equal(run(root, 'contract', 'seal', 'digest-change', '--scope', 'spec').status, 1);
    acceptIntent(root, 'digest-change');
    commit(root, 'accept intent');
    assert.equal(run(root, 'contract', 'seal', 'digest-change', '--scope', 'spec').status, 0);
    assert.equal(run(root, 'contract', 'seal', 'digest-change', '--scope', 'plan').status, 1, 'uncommitted spec approval cannot cross the gate');
    commit(root, 'approve spec');
    assert.equal(run(root, 'contract', 'seal', 'digest-change', '--scope', 'plan').status, 0);
    assert.equal(run(root, 'contract', 'validate', 'digest-change').status, 0);
    writeFileSync(file, readFileSync(file, 'utf8').replace('## Safeguards', '## Safeguards\n\nNew invariant.'));
    const stale = run(root, 'contract', 'validate', 'digest-change');
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /spec approval digest is missing or stale/);
    assert.match(stale.stdout, /plan approval digest is missing or stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('plan-only edits preserve spec approval but invalidate the plan approval', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'new', 'plan-change').status, 0);
    const file = path.join(root, '.aidlc/artifacts/contracts/plan-change.md');
    acceptIntent(root, 'plan-change');
    commit(root, 'accept intent');
    assert.equal(run(root, 'contract', 'seal', 'plan-change', '--scope', 'spec').status, 0);
    commit(root, 'approve spec');
    assert.equal(run(root, 'contract', 'seal', 'plan-change', '--scope', 'plan').status, 0);
    writeFileSync(file, readFileSync(file, 'utf8').replace('1. <Ordered implementation step naming an exact path.>', '1. Change `src/app.js`.'));
    const result = run(root, 'contract', 'validate', 'plan-change');
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /spec approval digest/);
    assert.match(result.stdout, /plan approval digest is missing or stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('evidence is emitted only for the exact approved contract digest', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'new', 'evidenced').status, 0);
    assert.equal(run(root, 'contract', 'evidence', 'evidenced').status, 1);
    acceptIntent(root, 'evidenced');
    commit(root, 'accept intent');
    assert.equal(run(root, 'contract', 'seal', 'evidenced', '--scope', 'spec').status, 0);
    commit(root, 'approve spec');
    assert.equal(run(root, 'contract', 'seal', 'evidenced', '--scope', 'plan').status, 0);
    assert.equal(run(root, 'contract', 'evidence', 'evidenced').status, 1, 'uncommitted plan approval cannot emit evidence');
    commit(root, 'approve plan');
    assert.match(run(root, 'contract', 'status', 'evidenced').stdout, /evidence/);
    // lean-v2 cut 5 removed `contract prompt`: it rendered a model prompt manifest that
    // nothing consumed, and its model resolution came from the deleted model-policy tree.
    assert.equal(run(root, 'contract', 'evidence', 'evidenced').status, 0);
    const contract = readFileSync(path.join(root, '.aidlc/artifacts/contracts/evidenced.md'), 'utf8');
    const evidence = JSON.parse(readFileSync(path.join(root, '.aidlc/artifacts/evidence/evidenced.json'), 'utf8'));
    assert.equal(evidence.contract_digest, contractDigest(contract, 'plan'));
    assert.equal(evidence.review.status, 'pending');
    assert.deepEqual(evidence.behaviours.B1, { status: 'pending', evidence: [] });
    assert.deepEqual(validateEvidence(evidence), []);
    evidence.behaviours.B1 = { status: 'pass', evidence: ['test:unit'] };
    evidence.review.status = 'approved';
    writeFileSync(path.join(root, '.aidlc/artifacts/evidence/evidenced.json'), JSON.stringify(evidence, null, 2) + '\n');
    assert.match(run(root, 'contract', 'status', 'evidenced').stdout, /complete/);
    assert.match(run(root, 'status', 'evidenced').stdout, /contracts[\s\S]*evidenced\s+complete\s+valid/);
    assert.equal(run(root, 'contract', 'evidence', 'evidenced').status, 1, 'durable evidence is never silently overwritten');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('contract identity and section ordering are validation boundaries', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'new', 'bound-id').status, 0);
    const file = path.join(root, '.aidlc/artifacts/contracts/bound-id.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Change id:** bound-id', 'Change id:** another-id').replace('## Outcome', '## Proof\n\nPremature proof.\n\n## Outcome'));
    const result = run(root, 'contract', 'validate', 'bound-id');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Change id must match/);
    assert.match(result.stdout, /section Proof is out of order/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// retire-the-legacy-lifecycle B7. Human approval is ordered: an intent is accepted before its
// spec is approved, and a spec before its plan. The only test of that ordering lived in the
// legacy lifecycle walk, so retiring it would have dropped the rule silently — which is the
// exact failure this line of work exists to stop.
test('approval order is a validation boundary: acceptance before spec, spec before plan', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'new', 'ordered').status, 0);
    const file = path.join(root, '.aidlc/artifacts/contracts/ordered.md');
    const digests = () => {
      const body = readFileSync(file, 'utf8');
      return { spec: body.match(/Spec approval digest:\*\* (\S+)/)[1], plan: body.match(/Plan approval digest:\*\* (\S+)/)[1] };
    };

    // A spec approved while the intent ref is still draft.
    writeFileSync(file, readFileSync(file, 'utf8').replace('Spec status:** draft', 'Spec status:** approved'));
    let result = run(root, 'contract', 'validate', 'ordered');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /spec cannot be approved before intent acceptance/);

    // A plan approved while the spec is still draft.
    writeFileSync(file, readFileSync(file, 'utf8')
      .replace('Spec status:** approved', 'Spec status:** draft')
      .replace('Plan status:** draft', 'Plan status:** approved'));
    result = run(root, 'contract', 'validate', 'ordered');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /plan cannot be approved before spec/);
    assert.deepEqual(digests(), { spec: 'pending', plan: 'pending' }, 'no approval digest was minted by claiming a status');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('all contracts can be validated as one CI boundary', () => {
  const root = repo();
  try {
    assert.equal(run(root, 'contract', 'validate', '--all').status, 0);
    assert.equal(run(root, 'contract', 'new', 'one').status, 0);
    assert.equal(run(root, 'contract', 'new', 'two').status, 0);
    assert.equal(run(root, 'contract', 'validate', '--all').status, 0);
    const file = path.join(root, '.aidlc/artifacts/contracts/two.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Risk:** standard', 'Risk:** reckless'));
    const result = run(root, 'contract', 'validate', '--all');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /PASS  one/);
    assert.match(result.stdout, /FAIL  two/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the comparative contract fixture is a valid approved contract', () => {
  const root = path.join(ROOT, 'evals/fixtures/contract-planned');
  const result = validateContract(root, path.join(root, '.aidlc/artifacts/contracts/hyphen-titlecase.md'));
  assert.equal(result.ok, true, result.issues.join('\n'));
  assert.equal(result.meta.spec_status, 'approved');
  assert.equal(result.meta.plan_status, 'approved');
});

