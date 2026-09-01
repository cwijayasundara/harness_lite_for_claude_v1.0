import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnose, qualifyExperiment, runGauntlet } from '../.aidlc/lib/gauntlet.mjs';

function layout(root) {
  const state = path.join(root, '.aidlc', 'state');
  mkdirSync(state, { recursive: true });
  return { root, state, ledger: path.join(state, 'ledger.jsonl'), lastCheck: path.join(state, 'last-check.json'), runId: path.join(state, 'run-id') };
}

function sensor(root) {
  const file = path.join(root, '.aidlc', 'project-sensor.mjs');
  writeFileSync(file, `
import { readFileSync } from 'node:fs';
const [kind, source, tests] = process.argv.slice(2);
const code = readFileSync(source, 'utf8');
const test = readFileSync(tests, 'utf8');
if (kind === 'behaviour' && (!code.includes('FEATURE_IMPLEMENTED') || code.includes('not-delivered'))) { console.error('required behaviour absent'); process.exit(1); }
if (kind === 'qa' && !test.includes('ASSERT_REQUIRED_BEHAVIOUR')) { console.error('required behaviour assertion removed'); process.exit(1); }
if (kind === 'arch' && code.includes('FORBIDDEN_BOUNDARY')) { console.error('forbidden dependency boundary'); process.exit(1); }
`);
}

const STACKS = {
  python: {
    source: 'app.py', tests: 'test_app.py',
    comment: '#',
    healthy: `def deliver():\n    # FEATURE_IMPLEMENTED\n    return "delivered"\n`,
    test: `from app import deliver\n# ASSERT_REQUIRED_BEHAVIOUR\nassert deliver() == "delivered"\n`,
    command: 'python3 test_app.py',
  },
  typescript: {
    source: 'app.ts', tests: 'app.test.ts',
    comment: '//',
    healthy: `export function deliver(): string { // FEATURE_IMPLEMENTED\n  return "delivered";\n}\n`,
    test: `import assert from 'node:assert/strict';\nimport { deliver } from './app.ts';\n// ASSERT_REQUIRED_BEHAVIOUR\nassert.equal(deliver(), 'delivered');\n`,
    command: 'node app.test.ts',
  },
  jvm: {
    source: 'App.java', tests: 'TestApp.java',
    comment: '//',
    healthy: `class App { // FEATURE_IMPLEMENTED\n  static String deliver() { return "delivered"; }\n}\n`,
    test: `class TestApp { // ASSERT_REQUIRED_BEHAVIOUR\n  public static void main(String[] args) { if (!App.deliver().equals("delivered")) throw new AssertionError(); }\n}\n`,
    // The project-owned JVM sensor is deliberately zero-install for CI conformance. A pod
    // replaces it with Maven/Gradle in exactly this capability slot.
    command: 'node .aidlc/project-sensor.mjs behaviour App.java TestApp.java',
  },
};

function project(stack, definition) {
  const root = mkdtempSync(path.join(os.tmpdir(), `aidlc-${stack}-`));
  mkdirSync(path.join(root, '.aidlc'), { recursive: true });
  sensor(root);
  writeFileSync(path.join(root, definition.source), definition.healthy);
  writeFileSync(path.join(root, definition.tests), definition.test);
  const cfg = {
    project: { name: `${stack}-conformance` }, layout: layout(root), formats: {},
    capabilities: {
      test: definition.command,
      test_quality: `node .aidlc/project-sensor.mjs qa ${definition.source} ${definition.tests}`,
      arch: `node .aidlc/project-sensor.mjs arch ${definition.source} ${definition.tests}`,
      secrets: '',
    },
    sensors: { behaviour: ['test'], architecture: ['arch'], hardening: ['secrets'], qa: ['test_quality'], required_profiles: ['behaviour', 'architecture', 'hardening', 'qa'], latency_budget_ms: 15000 },
    budget: { max_findings: 20 }, check: { fail_fast: true },
  };
  return { root, cfg, source: definition.source, tests: definition.tests, healthy: definition.healthy, test: definition.test };
}

test('gauntlet doctor fails closed when a required profile has no live capability', () => {
  const cfg = { capabilities: {}, sensors: { behaviour: ['test'], architecture: ['arch'], hardening: ['secrets'], qa: ['test_quality'], required_profiles: ['behaviour', 'architecture', 'hardening', 'qa'], latency_budget_ms: 1000 } };
  const result = diagnose(cfg);
  assert.equal(result.ok, false);
  assert.deepEqual(result.profiles.filter((profile) => !profile.ok).map((profile) => profile.name), ['behaviour', 'architecture', 'qa']);
});

test('Phase 4 conformance: Python, TypeScript, and JVM reject all four defect classes inside budget', async () => {
  const experiment = { schema: 'aidlc.sensor-experiment/v1', latency_budget_ms: 15000, baselines: [], cases: [] };
  for (const [stack, definition] of Object.entries(STACKS)) {
    const p = project(stack, definition); const files = [p.source, p.tests];
    const baseline = await runGauntlet(p.cfg, { files, write: false });
    assert.equal(baseline.ok, true, `${stack} baseline: ${JSON.stringify(baseline.profiles)}`);
    experiment.baselines.push({ stack, ok: true, latency_ms: baseline.ms });

    const defects = [
      ['do-nothing', () => writeFileSync(path.join(p.root, p.source), p.healthy.replace('return "delivered"', 'return "not-delivered"').replace('return "delivered";', 'return "not-delivered";'))],
      ['test-cheating', () => writeFileSync(path.join(p.root, p.tests), p.test.replace('ASSERT_REQUIRED_BEHAVIOUR', 'ASSERTION_REMOVED').replace(/assert deliver\(\) == "delivered"/, 'assert True').replace(/assert\.equal\(deliver\(\), 'delivered'\);/, "assert.equal(true, true);").replace(/if \(!App\.deliver\(\)\.equals\("delivered"\)\) throw new AssertionError\(\);/, 'if (false) throw new AssertionError();'))],
      ['boundary-breaking', () => writeFileSync(path.join(p.root, p.source), `${p.healthy}\n${definition.comment} FORBIDDEN_BOUNDARY\n`)],
      // The injected string below is the defect this case exists to detect. The allow marker is
      // on the JavaScript line only; the fixture it writes still carries the live secret, so the
      // hardening profile must still fail on it — see the assertion at the foot of this loop.
      ['security-defective', () => writeFileSync(path.join(p.root, p.source), `${p.healthy}\n${definition.comment} api_key = "sk-123456789012345678901234567890"\n`)], // harness:allow-secret
    ];
    for (const [defect, inject] of defects) {
      writeFileSync(path.join(p.root, p.source), p.healthy); writeFileSync(path.join(p.root, p.tests), p.test); inject();
      const report = await runGauntlet(p.cfg, { files, write: false });
      const detected = report.profiles.filter((profile) => profile.verdict === 'fail').map((profile) => profile.profile);
      const expected = { 'do-nothing': 'behaviour', 'test-cheating': 'qa', 'boundary-breaking': 'architecture', 'security-defective': 'hardening' }[defect];
      assert.deepEqual(detected, [expected], `${stack}/${defect}: ${JSON.stringify(report.profiles)}`);
      assert.equal(report.latency_ok, true);
      experiment.cases.push({ stack, defect, detected_by: detected, latency_ms: report.ms });
    }
  }
  const qualification = qualifyExperiment(experiment);
  assert.equal(qualification.ok, true, qualification.issues.join('\n'));
  assert.ok(qualification.profiles.every((profile) => profile.verdict === 'earning-its-place'));
});

test('qualification rejects a decorative profile with no unique seeded-defect value', () => {
  const cases = [];
  for (const stack of ['python', 'typescript', 'jvm']) for (const [defect, profile] of Object.entries({ 'do-nothing': 'behaviour', 'test-cheating': 'qa', 'boundary-breaking': 'architecture', 'security-defective': 'hardening' })) cases.push({ stack, defect, detected_by: profile === 'qa' ? ['behaviour'] : [profile], latency_ms: 1 });
  const result = qualifyExperiment({ schema: 'aidlc.sensor-experiment/v1', latency_budget_ms: 10, baselines: ['python', 'typescript', 'jvm'].map((stack) => ({ stack, ok: true, latency_ms: 1 })), cases });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /qa did not detect|qa: no incremental/);
});
