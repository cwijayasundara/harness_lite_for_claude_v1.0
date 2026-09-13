// G12. `harness init` fills the capability verbs it can see the tooling for.
//
// An empty verb is `skipped` (Law 6) — honest, and completely silent. A project installed the
// harness, ran `doctor`, saw nine dashes, and got a governance kernel with no sensors attached to
// it. What this file pins down is the other half of that honesty: detection reads the project's
// own manifests and never the machine it runs on, so two installs of one repository produce the
// same registry; and it fills an empty verb, never a configured one, because a hand-written
// command is a decision and re-running `init` must not undo it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { detect, applyDetection, detectionReport, ESLINT_THRESHOLDS } from '../.aidlc/lib/toolchain.mjs';
import { VERBS, loadConfig } from '../.aidlc/lib/config.mjs';
import { BIN, ROOT } from './_paths.mjs';

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'toolchain-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(root, rel), typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('a TypeScript project is read from its own manifests, and a runner it declares wins', () => {
  const p = project({ 'package.json': { name: 'x', devDependencies: { typescript: '^5', eslint: '^9', prettier: '^3' } },
    'tsconfig.json': { compilerOptions: { outDir: 'dist' } } });
  try {
    const d = detect(p.root);
    assert.deepEqual(d.stacks, ['node']);
    assert.match(d.capabilities.typecheck, /tsc --noEmit/);
    assert.match(d.capabilities.lint, /eslint/);
    assert.match(d.capabilities.fmt, /prettier/);
    assert.equal(d.formats.typecheck, 'tsc');
    assert.equal(d.formats.lint, 'eslint');
    // The compile-then-run shape. `test_changed` stays empty on purpose: the narrowed path is the
    // compiled file, not the source file the turn changed.
    assert.match(d.capabilities.test, /tsc --outDir dist && node --test/);
    assert.equal(d.capabilities.test_changed, undefined);
    assert.ok(d.notes.some((n) => /test_changed stays empty/.test(n)));
    assert.equal(d.formats.coverage, 'lcov');
    // Every command names its evidence, so a reader can check the registry against the project.
    for (const verb of Object.keys(d.capabilities)) assert.ok(d.evidence[verb], `${verb} has no evidence`);
  } finally { p.cleanup(); }
});

test('a declared test runner replaces the fallback rather than being added beside it', () => {
  const p = project({ 'package.json': { name: 'x', devDependencies: { typescript: '^5', vitest: '^2' } } });
  try {
    const d = detect(p.root);
    assert.match(d.capabilities.test, /vitest run/);
    assert.match(d.capabilities.test_changed, /vitest run .*\{files\}/);
    assert.match(d.capabilities.coverage, /vitest run --coverage/);
    assert.doesNotMatch(d.capabilities.test, /node --test/);
  } finally { p.cleanup(); }
});

test('a Python project is read from pyproject and requirements, hyphen-aware', () => {
  const p = project({ 'pyproject.toml': '[tool.ruff]\n[tool.mypy]\n[tool.pytest.ini_options]\n',
    'requirements.txt': 'pytest-cov==7.0.0\n' });
  try {
    const d = detect(p.root);
    assert.deepEqual(d.stacks, ['python']);
    assert.match(d.capabilities.fmt, /ruff format/);
    assert.equal(d.formats.lint, 'ruff');
    assert.equal(d.capabilities.typecheck, 'mypy .');
    assert.match(d.capabilities.test_changed, /\{files\}/);
    // `pytest` must not match inside `pytest-cov`, and `pytest-cov` must answer coverage.
    assert.equal(d.formats.coverage, 'coverage.py');
    assert.match(d.capabilities.coverage, /--cov/);
  } finally { p.cleanup(); }
});

test('what it cannot see stays empty, and a stack it has no verbs for says so', () => {
  const empty = project({ 'README.md': '# nothing to detect\n' });
  try {
    const d = detect(empty.root);
    assert.deepEqual(d.stacks, []);
    assert.deepEqual(d.capabilities, {});
    // The report is what a human reads before trusting the registry.
    const report = detectionReport(d, VERBS);
    assert.match(report, /none recognised/);
    for (const verb of VERBS.filter((v) => v !== 'secrets')) {
      assert.match(report, new RegExp(`--\\s+${verb}\\s+not detected`), verb);
    }
    // `secrets` is the one verb an empty command does not silence.
    assert.match(report, /set\s+secrets\s+the harness's built-in scanner/);
  } finally { empty.cleanup(); }

  const go = project({ 'go.mod': 'module example.com/x\n' });
  try {
    const d = detect(go.root);
    assert.deepEqual(d.stacks, ['go']);
    assert.deepEqual(d.capabilities, {}, 'a stack with no documented verb set must not be guessed at');
    assert.ok(d.notes.some((n) => /no Go verb set/.test(n)));
  } finally { go.cleanup(); }
});

test('detection fills an empty verb and never overwrites a configured one, section by section', () => {
  const registry = readFileSync(path.join(ROOT, '.aidlc/templates/harness.toml'), 'utf8');
  const detected = { capabilities: { lint: 'ruff check {files}', test: 'python3 -m pytest' }, formats: { lint: 'ruff' } };

  const first = applyDetection(registry, detected);
  assert.deepEqual(first.filled.sort(), ['lint', 'test']);
  assert.match(first.toml, /^lint\s+= "ruff check \{files\}"$/m);
  // The bug this pins: `lint = ""` appears in both [capabilities] and [formats], and a whole-file
  // substitution wrote the parser name over the command.
  const capabilities = first.toml.split('[formats]')[0];
  const formats = first.toml.split('[formats]')[1].split(/^\[/m)[0];
  assert.match(capabilities, /lint\s+= "ruff check \{files\}"/);
  assert.match(formats, /lint\s+= "ruff"/);
  assert.doesNotMatch(capabilities, /lint\s+= "ruff"$/m);

  // Second pass over its own output: a configured command is a decision and stays.
  const second = applyDetection(first.toml, { capabilities: { lint: 'something else entirely' }, formats: {} });
  assert.deepEqual(second.filled, []);
  assert.match(second.toml, /^lint\s+= "ruff check \{files\}"$/m);
});

test('init fills the registry it writes, reports on one it did not, and --no-detect opts out', () => {
  const p = project({ 'pyproject.toml': '[tool.ruff]\n[tool.pytest.ini_options]\n' });
  try {
    const run = (...args) => spawnSync(process.execPath, [BIN, 'init', '--into', p.root, ...args], { cwd: p.root, encoding: 'utf8' });
    assert.equal(run().status, 0);
    const cfg = loadConfig(p.root);
    assert.match(cfg.capabilities.lint, /ruff check/);
    assert.equal(cfg.formats.lint, 'ruff');
    assert.equal(cfg.capabilities.arch, '', 'a verb it cannot see stays empty');

    // A verb emptied by hand stays empty on a plain re-run: the registry belongs to the project.
    const config = path.join(p.root, '.aidlc/harness.toml');
    writeFileSync(config, readFileSync(config, 'utf8').replace(/^lint\s+= ".*"$/m, 'lint      = ""'));
    const rerun = run();
    assert.equal(loadConfig(p.root).capabilities.lint, '', 'a re-run overwrote a registry the project owns');
    assert.match(rerun.stderr, /re-run with --redetect/);

    assert.equal(run('--redetect').status, 0);
    assert.match(loadConfig(p.root).capabilities.lint, /ruff check/, '--redetect did not fill the emptied verb');
  } finally { p.cleanup(); }

  const opted = project({ 'pyproject.toml': '[tool.ruff]\n' });
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', opted.root, '--no-detect'], { cwd: opted.root, encoding: 'utf8' }).status, 0);
    assert.equal(loadConfig(opted.root).capabilities.lint, '');
  } finally { opted.cleanup(); }
});

test('both shipped examples run every verb their toolchain provides', () => {
  for (const [example, expected, pending] of [
    ['examples/scratch-ts', ['fmt', 'lint', 'typecheck', 'test', 'coverage', 'deps'], ['test_changed', 'test_quality', 'arch']],
    ['examples/scratch-py', ['fmt', 'lint', 'typecheck', 'test', 'test_changed', 'coverage', 'deps'], ['test_quality', 'arch']],
  ]) {
    const cfg = loadConfig(path.join(ROOT, example));
    const detected = detect(path.join(ROOT, example));
    for (const verb of expected) {
      assert.ok(cfg.capabilities[verb]?.trim(), `${example}: ${verb} is empty`);
      assert.equal(cfg.capabilities[verb], detected.capabilities[verb],
        `${example}: ${verb} drifted from what detection writes`);
    }
    // Named rather than silent: these are the verbs still skipped, and each has an owner.
    // `test_quality` is deleted by G13 and `arch` is filled by G14's opt-in layering verb.
    for (const verb of pending) assert.equal(cfg.capabilities[verb] ?? '', '', `${example}: ${verb} is no longer pending`);
    assert.equal(cfg.capabilities.secrets ?? '', '', 'the built-in scanner is the default');
  }
});

test('the eslint thresholds the harness documents are the ones the TypeScript example enforces', () => {
  const config = readFileSync(path.join(ROOT, 'examples/scratch-ts/eslint.config.js'), 'utf8');
  for (const [rule, threshold] of Object.entries(ESLINT_THRESHOLDS)) {
    const quoted = /^[a-z]+$/.test(rule) ? `${rule}:` : `"${rule}":`;
    assert.match(config, new RegExp(`${quoted}\\s*\\["error",\\s*${threshold}\\]`),
      `${rule} is not enforced at the documented threshold ${threshold}`);
  }
  // A rule that only warns is a rule the loop never has to answer for: `check` grades exit codes.
  assert.doesNotMatch(config, /"warn"/);
  assert.match(readFileSync(path.join(ROOT, 'docs/OPERATING.md'), 'utf8'),
    /complexity.*10.*max-lines-per-function.*60.*max-params.*4/s, 'the thresholds are undocumented');
  assert.ok(existsSync(path.join(ROOT, 'examples/scratch-ts/.prettierignore')),
    'the generated projections must be excluded from the formatter that checks them');
});
