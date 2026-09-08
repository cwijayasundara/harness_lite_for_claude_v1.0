// host-evidence-not-certification: host review is evidence and pins are anchors, never a
// certificate. This file states the ceiling; behaviour lives in review/runtime-identity tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BIN, ROOT } from './_paths.mjs';
import { RUNTIME_PATHS, executionIdentity, shimVerifierSource } from '../.aidlc/lib/runtime-identity.mjs';

const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const REVIEW = read('.aidlc/lib/review.mjs');
const IDENTITY = read('.aidlc/lib/runtime-identity.mjs');
const PRODUCT = read('.aidlc/lib/product-context.mjs');
const HARNESS = read('.aidlc/bin/harness');

test('B1 the host assessment states and the single verified condition are the whole surface', () => {
  const decision = REVIEW.match(/report\.assessment = [\s\S]*?;\n/);
  assert.ok(decision, 'host assessment decision missing');
  // GraphQL enums are upper case, so lower-case literals in the chain are exactly our states.
  const derived = [...decision[0].matchAll(/'([a-z][a-z-]+)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(derived)].sort(), [
    'approval-not-established', 'candidate-mismatch', 'changes-requested',
    'host-policy-approved', 'policy-unavailable',
  ], 'a new host assessment state needs its own approved contract');
  assert.match(REVIEW, /assessment: 'unavailable', verified: false/, 'evidence starts unavailable and unverified');

  const verified = [...REVIEW.matchAll(/report\.verified = (.*);/g)];
  assert.equal(verified.length, 1, 'verified is established in exactly one place');
  assert.equal(verified[0][1],
    "report.provenance === 'github-api' && report.assessment === 'host-policy-approved'",
    'only a live host API call reporting its own approving decision may verify');

  assert.match(REVIEW, /verification_scope: 'visible branch review count and current reviewers with push access'/);
  assert.match(REVIEW, /remain host responsibilities\. Local JSON is not a signed attestation\./);
});

test('B2 the harness records the host decision and derives no merge authority of its own', () => {
  // The conservative downgrades are the honest part: no verdict while a control is invisible.
  for (const guard of [
    /!policy\?\.requiresApprovingReviews/,
    /policy\.requiresCodeOwnerReviews !== false/,
    /policy\.requireLastPushApproval !== false/,
    /policy\.requiredApprovingReviewCount < 1/,
  ]) assert.match(REVIEW, guard, 'a branch control was dropped from the conservative downgrade');
  assert.match(REVIEW, /currentApprovals\.length >= policy\.requiredApprovingReviewCount/,
    'approval counting is the visible host count, not a locally chosen threshold');

  // Merge identity is copied from the host or absent; it is never inferred.
  assert.match(REVIEW, /snapshot\.state === 'MERGED' && snapshot\.mergedAt && snapshot\.mergeCommit\?\.oid/);
  assert.doesNotMatch(REVIEW, /\bmutation\b/, 'host evidence is read-only');

  const verbs = [...HARNESS.matchAll(/^ {4}case '([a-z-]+)':/gm)].map(m => m[1]);
  assert.deepEqual(verbs.sort(), ['approve', 'baseline', 'check', 'doctor', 'evals', 'graph', 'hook',
    'init', 'ledger', 'map', 'new', 'pack', 'review', 'status'],
    'no verb signs, attests, certifies, merges or pushes');
  const help = execFileSync(process.execPath, [BIN], { encoding: 'utf8' });
  assert.doesNotMatch(help, /\bsign\b|\battest\b|\bcertif|\bmerge\b|\bpush\b/i);
});

test('B3 runtime, policy and execution identity stay unsigned comparison anchors', () => {
  assert.deepEqual(RUNTIME_PATHS, ['.aidlc/bin', '.aidlc/lib', '.aidlc/checks', '.aidlc/sensors',
    '.aidlc/hooks', '.aidlc/adapters', '.aidlc/skills', '.aidlc/roles', '.aidlc/templates',
    '.aidlc/policies', '.aidlc/instructions.md', '.claude-plugin'],
    'identity coverage is a decision, not a growing list');

  for (const outcome of [/status: 'mismatch', method: 'unavailable'/,
    /status: observed\.committed \? 'verified' : 'development', method: 'self-checkout'/,
    /status: seen\.committed \? 'verified' : 'unverified'/,
    /status: 'unverified', method: 'legacy-or-invalid-record'/,
    /method: observed\.commit \? 'git-and-content' : 'pinned-content'/]) {
    // Assert on the boolean: a failed match must name the pattern, not print the whole module.
    assert.ok(outcome.test(IDENTITY), `verify outcome changed: ${outcome}`);
  }
  assert.match(IDENTITY, /never load a candidate to verify it/);
  assert.doesNotMatch(IDENTITY, /\bsign\b|signature|attestation/i, 'pins are not signatures');

  const identity = executionIdentity(ROOT);
  assert.equal(identity.actor.authenticated, false, 'no label authenticates a reviewer');
  assert.equal(identity.trust, 'unsigned-local-observation');
  // Self-checkout reports what the working tree is: verified when committed, development when not.
  assert.equal(identity.runtime.method, 'self-checkout');
  assert.ok(['verified', 'development'].includes(identity.runtime.status), identity.runtime.status);

  // The shim verifies before executing runtime code, so it may load nothing but Node builtins.
  const required = [...shimVerifierSource().matchAll(/require\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(required.length, 'shim verifier loads nothing');
  for (const spec of required) assert.match(spec, /^"node:[a-z_]+"$/, `shim loaded ${spec}`);
});

test('B4 archived host evidence is read, never re-certified', () => {
  const row = PRODUCT.match(/result\.host = \{[\s\S]*?\};/);
  assert.ok(row, 'delivery host row missing');
  assert.deepEqual([...row[0].matchAll(/(?:\{|,)\s*([a-z_]+):/g)].map(m => m[1]),
    ['path', 'revision', 'blob', 'provenance', 'assessment', 'verified', 'recorded_verification', 'limitation'],
    'a delivery host verdict field was added or removed');
  assert.match(row[0], /verified: false/, 'reading an archive never verifies it now');
  assert.match(row[0], /Archived unsigned observation; no live host authentication or deployment observation\./);
  assert.match(PRODUCT, /trust: 'unsigned local evidence'/);
  assert.match(PRODUCT, /meaning: 'recorded repository integration; not deployment or acceptance'/);
});

test('B5 the guidance and the lean-review row state the limit', () => {
  const readme = read('README.md');
  assert.match(readme, /host's full merge controls\s+remain authoritative/i);
  assert.match(readme, /derives no merge eligibility/i);
  assert.match(readme, /not a signed attestation/);
  assert.match(readme, /not\s+publisher authentication or a security sandbox/);
  assert.match(read('.aidlc/policies/review.md'), /merge authority is the host's/i);

  const row = read('docs/IMPROVEMENT-PLAN.md').split('\n')
    .find(l => l.startsWith('| Host review and runtime identity |'));
  assert.ok(row, 'lean-review host row missing');
  assert.match(row, /authoritative/i);
  assert.match(row, /unsigned/i);
  assert.match(row, /no (new )?(signing|certification)/i);

  const limits = read('.aidlc/harness.toml');
  assert.match(limits, /^skills\s*=\s*7$/m);
  assert.match(limits, /^agents\s*=\s*3$/m);
  assert.match(limits, /^hooks\s*=\s*5$/m);
});
