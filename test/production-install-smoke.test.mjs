// Production seam: install the harness into empty Python and TypeScript repositories, then
// exercise the same hooks Claude Code invokes after an informal edit. No intent/spec/plan is
// created: ambient assurance must not depend on the developer remembering the SDLC workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BIN } from './_paths.mjs';

const TOML = ({ capabilities, formats = '' }) => `[project]
name = "production-smoke"

[capabilities]
${capabilities}
coverage = ""
deps = ""
secrets = ""

${formats}
[check]
fail_fast = true

[stages]
fast = ["fmt", "lint"]
stop = ["fast", "test"]
stop_hook = ["fast", "test_changed"]
commit = ["stop", "secrets"]
drift = []

[sensors]
behaviour = ["test"]
architecture = ["arch"]
hardening = ["secrets"]
qa = ["fmt", "lint"]
required_profiles = ["behaviour", "architecture", "hardening", "qa"]
latency_budget_ms = 120000

[limits]
skills = 7
agents = 2
hooks = 4
hook_loc = 600
claude_md_lines = 120
`;

function run(root, args, input = undefined, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: root, encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input),
    env: { ...process.env, ...env },
  });
}

function commit(root, message) {
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Harness Smoke', '-c', 'user.email=smoke@example.invalid',
    'commit', '-qm', message], { cwd: root });
}

function install(t, language) {
  const root = mkdtempSync(path.join(tmpdir(), `harness-production-${language}-`));
  const home = mkdtempSync(path.join(tmpdir(), 'harness-production-home-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const init = run(root, ['init', '--into', root], undefined, { HOME: home });
  assert.equal(init.status, 0, init.stderr);
  return { root, home };
}

const products = {
  python: {
    source: 'src/app.py', test: 'test/test_app.py',
    before: 'def add(a, b):\n    return a + b\n',
    after: 'def add(a, b):\n    result = a + b\n    return result\n',
    testBody: 'import unittest\nfrom pathlib import Path\n\nclass AppTest(unittest.TestCase):\n    def test_implementation_exists(self): self.assertIn("return", Path("src/app.py").read_text())\n\nif __name__ == "__main__": unittest.main()\n',
    config: TOML({ capabilities: [
      'fmt = "python3 -c \'import ast,sys;[ast.parse(open(f).read()) for f in sys.argv[1:]]\' {files}"',
      'lint = "python3 -c \'import ast,sys;[ast.parse(open(f).read()) for f in sys.argv[1:]]\' {files}"',
      'typecheck = ""',
      'test = "python3 -m unittest discover -s test -p \'test_*.py\' -q"',
      'test_changed = "PYTHONPATH=. python3 -m unittest discover -s test -p \'test_*.py\' -q"',
      'arch = "python3 -c \'import ast;ast.parse(open(\\"src/app.py\\").read())\'"',
    ].join('\n') }),
  },
  typescript: {
    source: 'src/app.ts', test: 'test/app.test.ts',
    before: 'export function add(a: number, b: number): number { return a + b; }\n',
    after: 'export function add(a: number, b: number): number { const result = a + b; return result; }\n',
    testBody: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/app.ts';\ntest('add', () => assert.equal(add(2, 3), 5));\n",
    config: TOML({ capabilities: [
      'fmt = "node --experimental-strip-types --check {files}"',
      'lint = "node --experimental-strip-types --check {files}"',
      'typecheck = ""',
      'test = "node --experimental-strip-types --test test/*.test.ts"',
      'test_changed = "node --experimental-strip-types --test {files}"',
      'arch = "node --experimental-strip-types --check src/app.ts"',
    ].join('\n'), formats: '[formats]\ntest = "tap"\ntest_changed = "tap"\n\n' }),
  },
};

for (const [language, product] of Object.entries(products)) {
  test(`fresh ${language} consumer passes production admission and vibe-code hooks`, (t) => {
    const { root, home } = install(t, language);
    mkdirSync(path.join(root, 'src'), { recursive: true });
    mkdirSync(path.join(root, 'test'), { recursive: true });
    writeFileSync(path.join(root, product.source), product.before);
    writeFileSync(path.join(root, product.test), product.testBody);
    writeFileSync(path.join(root, '.claude/harness/harness.toml'), product.config);
    commit(root, 'production fixture');

    const doctor = run(root, ['doctor', '--production', '--json'], undefined, { HOME: home });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    const diagnosis = JSON.parse(doctor.stdout);
    assert.equal(diagnosis.production.ok, true);
    assert.deepEqual(diagnosis.agent_collisions, []);

    // An ordinary edit, with no harness artifacts, must still trigger fast QA and targeted tests.
    writeFileSync(path.join(root, product.source), product.after);
    // A vibe-coded behaviour change normally adjusts its focused test in the same turn. Keeping
    // it dirty also proves Stop consumes the turn's Git diff rather than only the last hook input.
    writeFileSync(path.join(root, product.test), `${product.testBody}\n`);
    assert.equal(run(root, ['hook', 'session-start'], { cwd: root, hook_event_name: 'SessionStart' }, { HOME: home }).status, 0);
    const post = run(root, ['hook', 'post-write'], {
      cwd: root, hook_event_name: 'PostToolUse', tool_name: 'Edit',
      tool_input: { file_path: path.join(root, product.source) },
    }, { HOME: home });
    assert.equal(post.status, 0, post.stderr);
    const stop = run(root, ['hook', 'stop'], { cwd: root, hook_event_name: 'Stop' }, { HOME: home });
    assert.equal(stop.status, 0, stop.stderr || stop.stdout);

    const rows = readFileSync(path.join(root, '.claude/harness/state/ledger.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(rows.some((row) => row.stage === 'fast' && row.control === 'fmt' && row.verdict === 'pass'));
    assert.ok(rows.some((row) => row.stage === 'fast' && row.control === 'lint' && row.verdict === 'pass'));
    assert.ok(rows.some((row) => row.stage === 'stop_hook' && row.control === 'test_changed' && row.verdict === 'pass'),
      JSON.stringify(rows.filter((row) => row.stage === 'stop_hook'), null, 2));
    const settings = JSON.parse(readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
    assert.equal('hooks' in settings, false, 'consumer settings must not duplicate plugin-owned hooks');
    assert.deepEqual(Object.values(settings.enabledPlugins), [true]);
  });
}
