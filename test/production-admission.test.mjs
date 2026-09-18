import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessProduction, renderProduction } from '../.claude/harness/lib/admission.mjs';

const cfg = (capabilities = {}, sensors = {
  behaviour: ['test'], architecture: ['arch'], hardening: ['secrets', 'deps'], qa: ['fmt', 'lint', 'typecheck'],
  required_profiles: ['behaviour', 'architecture', 'hardening', 'qa'],
}, waivers = {}) => ({ capabilities, sensors, waivers });

test('production admission rejects an installed harness whose sensors would all skip', () => {
  const result = assessProduction(cfg());
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((f) => f.name).sort(), ['architecture', 'behaviour', 'qa', 'test', 'test_changed']);
  assert.match(renderProduction(result), /SKIP is not production evidence/);
});

test('the built-in secret scanner satisfies hardening but not unrelated profiles', () => {
  const result = assessProduction(cfg({ test: 'make test', test_changed: 'make test-changed' }));
  assert.equal(result.profiles.find((p) => p.profile === 'hardening').ok, true);
  assert.equal(result.profiles.find((p) => p.profile === 'architecture').ok, false);
});

test('one live command per required profile plus full and targeted tests admits a project', () => {
  const result = assessProduction(cfg({
    test: 'make test', test_changed: 'make test-changed', arch: 'make arch', lint: 'make lint',
  }));
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.match(renderProduction(result), /production admission: PASS/);
});

test('a required profile with no declared verbs fails explicitly', () => {
  const result = assessProduction(cfg({ test: 't', test_changed: 'tc' }, { behaviour: ['test'], empty: [], required_profiles: ['behaviour', 'empty'] }));
  assert.equal(result.ok, false);
  assert.match(result.findings.find((f) => f.name === 'empty').reason, /declares no capability/);
});

test('a project cannot opt out of behaviour, hardening or QA by shortening required_profiles', () => {
  const result = assessProduction(cfg({ test: 't', test_changed: 'tc' }, {
    behaviour: ['test'], hardening: ['secrets'], qa: ['lint'], required_profiles: ['behaviour'],
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.profiles.map((p) => p.profile), ['behaviour', 'hardening', 'qa']);
  assert.deepEqual(result.findings.map((f) => f.name), ['qa']);
});

test('architecture is required when declared and optional when the project has no architecture sensor', () => {
  const capabilities = { test: 't', test_changed: 'tc', lint: 'lint' };
  const without = assessProduction(cfg(capabilities, {
    behaviour: ['test'], hardening: ['secrets'], qa: ['lint'], required_profiles: [],
  }));
  assert.equal(without.ok, true, JSON.stringify(without.findings));
  const withArchitecture = assessProduction(cfg(capabilities, {
    behaviour: ['test'], hardening: ['secrets'], qa: ['lint'], architecture: ['arch'], required_profiles: [],
  }));
  assert.equal(withArchitecture.ok, false);
  assert.equal(withArchitecture.findings.find((f) => f.name === 'architecture').kind, 'profile');
});

test('a reviewed unexpired waiver is visible and temporarily removes only its named finding', () => {
  const now = Date.parse('2026-09-18T12:00:00Z');
  const result = assessProduction(cfg({ test: 't', test_changed: 'tc', lint: 'lint' }, {
    behaviour: ['test'], hardening: ['secrets'], qa: ['lint'], architecture: ['arch'], required_profiles: [],
  }, { architecture: { reason: 'legacy boundary migration', owner: 'platform-team', expires: '2026-10-01T00:00:00Z' } }), { now });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.deepEqual(result.waivers.map((w) => [w.target, w.status]), [['architecture', 'active']]);
  assert.match(renderProduction(result), /WAIVED waiver architecture: platform-team, expires 2026-10-01T00:00:00.000Z/);
});

test('expired, malformed, unknown and unused waivers fail production admission', () => {
  const now = Date.parse('2026-09-18T12:00:00Z');
  const base = { test: 't', test_changed: 'tc', lint: 'lint' };
  for (const [target, waiver, message] of [
    ['qa', { reason: 'x', owner: 'team', expires: '2026-09-18T11:59:59Z' }, /expired/],
    ['qa', { reason: '', owner: 'team', expires: '2026-10-01T00:00:00Z' }, /reason is required/],
    ['invented', { reason: 'x', owner: 'team', expires: '2026-10-01T00:00:00Z' }, /unknown waiver target/],
    ['test', { reason: 'x', owner: 'team', expires: '2026-10-01T00:00:00Z' }, /unused/],
  ]) {
    const capabilities = target === 'qa' ? { ...base, lint: '' } : base;
    const result = assessProduction(cfg(capabilities, {
      behaviour: ['test'], hardening: ['secrets'], qa: ['lint'], required_profiles: [],
    }, { [target]: waiver }), { now });
    assert.equal(result.ok, false, target);
    assert.match(result.findings.find((f) => f.kind === 'waiver').reason, message);
  }
});

test('admission evidence distinguishes missing, skipped, errored, failed and passed outcomes', () => {
  const result = assessProduction(cfg({ test: 't', test_changed: 'tc', lint: 'lint', arch: 'arch' }), {
    evidence: [
      { control: 'test', verdict: 'pass', stage: 'commit', ts: '2026-09-18T12:00:00Z' },
      { control: 'test_changed', verdict: 'skipped', stage: 'stop_hook', note: 'no affected test' },
      { control: 'lint', verdict: 'errored', stage: 'fast', error: 'tool unavailable' },
      { control: 'arch', verdict: 'fail', stage: 'commit' },
    ],
  });
  assert.equal(result.profiles.find((p) => p.profile === 'behaviour').evidence.status, 'passed');
  assert.equal(result.profiles.find((p) => p.profile === 'hardening').evidence.status, 'skipped');
  assert.equal(result.profiles.find((p) => p.profile === 'qa').evidence.status, 'errored');
  assert.equal(result.profiles.find((p) => p.profile === 'architecture').evidence.status, 'failed');
  assert.equal(result.commands.find((c) => c.verb === 'test_changed').evidence.status, 'skipped');
  assert.equal(result.evidence_ok, false);

  const missing = assessProduction(cfg({ test: 't', test_changed: '' }), { evidence: [] });
  assert.equal(missing.commands.find((c) => c.verb === 'test_changed').evidence.status, 'missing');
});
