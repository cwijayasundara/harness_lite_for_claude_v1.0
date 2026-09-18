import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessProduction, renderProduction } from '../.claude/harness/lib/admission.mjs';

const cfg = (capabilities = {}, sensors = {
  behaviour: ['test'], architecture: ['arch'], hardening: ['secrets', 'deps'], qa: ['fmt', 'lint', 'typecheck'],
  required_profiles: ['behaviour', 'architecture', 'hardening', 'qa'],
}) => ({ capabilities, sensors });

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
