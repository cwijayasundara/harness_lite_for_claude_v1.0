// Local two-environment simulation, not physical machines or hosted CI. Fixture gates simulated.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { stage, FIXTURES } from '../../../evals/lib/stage.mjs';
import { productFixture } from '../../../test/_product-context-fixture.mjs';
import { check } from '../../lib/runner.mjs';
import { runtimeIdentity, policyIdentity } from '../../lib/runtime-identity.mjs';
import { exportInvocation } from '../../lib/ledger.mjs';
const root = process.cwd();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const temp = mkdtempSync(path.join(tmpdir(), 'team-reuse-'));
const fixtures = [];
const python = process.env.HARNESS_TRACE_PYTHON ?? 'python3';
const command = `PYTHONPATH=src '${python.replaceAll("'", "'\\''")}' -m pytest -q tests --json-report --json-report-file={report}`;
const hyphenCode = 'def titlecase(value: str) -> str:\n    return " ".join("-".join(part[:1].upper() + part[1:] for part in word.split("-")) for word in value.split(" "))\n';
const originalAssertions = 'from app.text import titlecase\n\ndef test_rule():\n    assert titlecase("mary-jane watson") == "Mary-Jane Watson"\n    assert titlecase("ada lovelace") == "Ada Lovelace"\n';
try {
  const environments = [];
  for (const n of [1, 2]) {
    const runtime = path.join(temp, `runtime-${n}`);
    execFileSync('git', ['clone', '-q', '--local', '--no-hardlinks', root, runtime]);
    execFileSync('git', ['checkout', '-q', '--detach', revision], { cwd: runtime });
    const s = stage(FIXTURES, 'contract-planned'); fixtures.push(s);
    execFileSync(process.execPath, [path.join(runtime, '.aidlc/bin/harness'), 'init', '--into', s.work]);
    const doctor = spawnSync('bash', [path.join(s.work, '.aidlc/bin/harness'), 'doctor', '--json'], {
      cwd: s.work, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: runtime },
    });
    assert.equal(doctor.status, 0, doctor.stderr);
    environments.push({ runtime, s, identity: JSON.parse(doctor.stdout) });
  }
  assert.equal(environments[0].identity.runtime.observed.content.digest, environments[1].identity.runtime.observed.content.digest);
  assert.equal(environments[0].identity.policy.digest, environments[1].identity.policy.digest);
  const output = { repository_revision: revision, local_two_environment_simulation: true, physical_machines: false,
    hosted_ci: false, simulated_approvals: true, source_fixtures_modified: false,
    procedure_source: '.aidlc/artifacts/product-design-context/post-fix.mjs',
    procedure: 'Preserve assertions, add a failing product case, implement within fresh approved scope, capture exact-candidate executed proof.',
    environments: environments.map(e => e.identity), trials: [] };
  for (const [i, e] of environments.entries()) {
    const f = productFixture(e.s.work);
    f.write('.aidlc/harness.toml', `[project]\nname = "names-product"\n[capabilities]\ntest = ${JSON.stringify(command)}\n[formats]\ntest = "pytest"\n[stages]\nstop = ["test"]\n`);
    f.cfg.capabilities.test = command; f.cfg.formats.test = 'pytest'; f.cfg.stages.stop = ['test'];
    const original = readFileSync(path.join(e.s.work, 'tests/test_app.py'), 'utf8');
    let sourceRevision = f.source;
    if (i === 1) {
      f.write('src/app/text.py', hyphenCode); f.write('tests/test_rule.py', originalAssertions);
      f.commit('Simulated previously integrated hyphen rule on second product slice');
      f.write('requirements.md', '# Apostrophe names\n\n## Acceptance criteria\n\n| Criterion ID | Criterion |\n|---|---|\n| names | Render sean o\'neill as Sean O\'Neill while preserving space and hyphen rules. |\n');
      sourceRevision = f.commit('Simulated new product criterion for second slice');
    } else f.commit('Configure first product slice proof');
    const change = f.prepare(i === 0 ? 'hyphen-reuse' : 'apostrophe-reuse', { sourceRevision,
      ...(i === 1 ? { rule: "Given sean o'neill, when formatting, then return Sean O'Neill and preserve space and hyphen rules." } : {}),
    });
    f.write('tests/test_rule.py', originalAssertions + (i === 1 ? `    assert titlecase("sean o'neill") == "Sean O'Neill"\n` : ''));
    const failingCandidate = f.commit('Add failing product assertion under simulated approved scope');
    const failed = await check(f.cfg, { stage: 'stop', base: change.base, candidate: failingCandidate, change: change.slug, actor: 'simulated-product-engineer' });
    assert.equal(failed.ok, false); assert(failed.controls.some(c => c.control === 'test' && c.verdict === 'fail'), JSON.stringify(failed.identity_errors));
    const failedExport = exportInvocation(f.cfg.layout, failed.provenance.invocation);
    f.write('src/app/text.py', i === 0 ? hyphenCode : `def titlecase(value: str) -> str:\n    return " ".join("-".join("'".join(part[:1].upper() + part[1:] for part in chunk.split("'")) for chunk in word.split("-")) for word in value.split(" "))\n`);
    const candidate = f.commit('Implement bounded product slice');
    const passed = await check(f.cfg, { stage: 'stop', base: change.base, candidate, change: change.slug, actor: 'simulated-product-engineer' });
    assert.equal(passed.ok, true, JSON.stringify({ errors: passed.identity_errors, controls: passed.controls }));
    assert.equal(passed.trace.behaviours[0].status, 'passed', JSON.stringify(passed.trace));
    assert.equal(readFileSync(path.join(e.s.work, 'tests/test_app.py'), 'utf8'), original);
    const cliExport = JSON.parse(execFileSync('bash', [path.join(e.s.work, '.aidlc/bin/harness'), 'ledger', 'export', '--invocation', passed.provenance.invocation], { cwd: e.s.work, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: e.runtime }, maxBuffer: 16 * 1024 * 1024 }));
    assert.equal(cliExport.provenance.change, change.slug); assert.equal(cliExport.report.revision.candidate, candidate);
    output.trials.push({ slice: change.slug, prior_assertions_preserved: true, failed: failedExport, passed: cliExport });
  }
  const e = environments[1];
  execFileSync('git', ['-c', 'user.name=Simulated', '-c', 'user.email=simulated@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Simulated wrong runtime commit'], { cwd: e.runtime });
  assert.equal(runtimeIdentity(e.s.work, e.runtime).status, 'mismatch');
  execFileSync('git', ['checkout', '-q', '--detach', revision], { cwd: e.runtime });
  const file = path.join(e.runtime, '.aidlc/lib/paths.mjs'); writeFileSync(file, readFileSync(file, 'utf8') + '\n// simulated runtime drift\n');
  assert.equal(runtimeIdentity(e.s.work, e.runtime).status, 'mismatch');
  const policyBefore = policyIdentity(e.s.work).digest;
  writeFileSync(path.join(e.s.work, 'CLAUDE.md'), 'Simulated additional policy\n');
  assert.notEqual(policyIdentity(e.s.work).digest, policyBefore);
  output.negative_trials = { wrong_commit: 'mismatch', changed_runtime: 'mismatch', changed_policy: 'different-digest' };
  writeFileSync('.aidlc/artifacts/team-reuse/post-fix.json', JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ revision, equal_initial_identities: true, slices: output.trials.map(t => ({ change: t.slice, before: t.failed.summary.ok, after: t.passed.summary.ok, proof: t.passed.report.trace.behaviours[0].status })), negative_trials: output.negative_trials, local_two_environment_simulation: true }, null, 2));
} finally { for (const s of fixtures) s.cleanup(); rmSync(temp, { recursive: true, force: true }); }
