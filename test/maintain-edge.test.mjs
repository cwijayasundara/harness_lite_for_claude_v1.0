// G19. The Maintain edge closes: a control band breach becomes an intent the gate accepts, a spec
// and plan a human approves, and a change the driver will execute.
//
// It did not close before. `band-to-intent.mjs` wrote an intent with no `source` and no
// `source_revision`, and gate 1 refused an intent without them — so the script produced a document
// that looked like the start of the loop and could not be carried through it. The loop appeared to
// close and did not, which is the most expensive kind of not working.
//
// One test, one path, no model: breach → intent → approved spec → approved plan → the driver
// accepting the change and running its phases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import * as a from '../.claude/harness/lib/artifacts.mjs';
import { loadConfig } from '../.claude/harness/lib/config.mjs';
import { deliver, PHASES } from '../.claude/harness/lib/deliver.mjs';
import { BIN, ROOT } from './_paths.mjs';

const SCRIPT = path.join(ROOT, 'examples/maintain/band-to-intent.mjs');
const BREACH = { bands: [{ metric: 'overdue_rate', observed: 0.31, mean: 0.12, stdev: 0.04 }] };
const SLUG = 'overdue_rate-breach'.replace(/[^a-z0-9-]+/g, '-');

function project({ commitBands = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'maintain-'));
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'ops@example.invalid');
  git('config', 'user.name', 'Ops');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/ledger.mjs'), 'export const overdue = () => false;\n');
  writeFileSync(path.join(root, 'bands.json'), JSON.stringify(BREACH, null, 2) + '\n');
  assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' }).status, 0);
  git('add', '-A');
  if (commitBands) git('commit', '-qm', 'observed bands');
  return { root, git, cfg: () => loadConfig(root), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// HARNESS_BIN points the example at the harness under test. A consumer uses its own shim; this
// repository's shim refuses to resolve against an uncommitted runtime, which is the shim working
// as designed and not something to route around in the example.
const detect = (root, file) => spawnSync(process.execPath, [SCRIPT, ...(file ? [file] : [])],
  { cwd: root, encoding: 'utf8', env: { ...process.env, HARNESS_BIN: BIN },
    ...(file ? {} : { input: JSON.stringify(BREACH) }) });

test('a breach against a committed bands file writes an intent the gate can bind', () => {
  const p = project();
  try {
    const result = detect(p.root, 'bands.json');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /BREACH {2}overdue_rate at 4σ/);

    const intent = readFileSync(path.join(p.root, '.claude/harness/artifacts', SLUG, 'intent.md'), 'utf8');
    const { front } = a.parse(intent);
    assert.equal(front.source, 'bands.json');
    assert.equal(front.source_revision, p.git('rev-parse', 'HEAD'));
    assert.match(result.stdout, /bound to bands\.json at [0-9a-f]{12}/);

    // The incident becomes a permanent eval in the same step, because the step after an incident
    // is the one nobody comes back to.
    assert.match(result.stdout, /regression eval seeded/);
    const pending = path.join(p.root, '.claude/harness/evals/pending', `${SLUG}.json`);
    assert.ok(existsSync(pending), result.stdout);
    assert.equal(JSON.parse(readFileSync(pending, 'utf8')).id, SLUG);
  } finally { p.cleanup(); }
});

test('an unbindable bands document is reported as unbound, never written as a half-declaration', () => {
  // Uncommitted: there is a file, and no revision to bind it to.
  const uncommitted = project({ commitBands: false });
  try {
    const result = detect(uncommitted.root, 'bands.json');
    assert.equal(result.status, 0, result.stderr);
    const { front } = a.parse(readFileSync(path.join(uncommitted.root, '.claude/harness/artifacts', SLUG, 'intent.md'), 'utf8'));
    assert.equal(front.source, undefined, 'a source with no revision is a half-declaration that fails later');
    assert.equal(front.source_revision, undefined);
    assert.match(result.stdout, /UNBOUND: bands\.json (is not committed|has uncommitted changes)/);
    assert.match(result.stdout, /commit the bands document and re-run to bind/);
  } finally { uncommitted.cleanup(); }

  // On stdin there is no document at all, which is a different reason for the same answer.
  const piped = project();
  try {
    const result = detect(piped.root, null);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UNBOUND: the bands document arrived on stdin/);
  } finally { piped.cleanup(); }
});

test('breach to intent to approved spec to the driver, in one path and with no model', async () => {
  const p = project();
  try {
    assert.equal(detect(p.root, 'bands.json').status, 0);
    const cfg = p.cfg();
    const dir = path.join(p.root, '.claude/harness/artifacts', SLUG);

    // A human triages the breach into a spec and a plan. This is the part that is theirs; what
    // the test asserts is that nothing in the chain refuses the artifacts the breach produced.
    writeFileSync(path.join(dir, 'spec.md'), a.render({ status: 'draft' },
      `# Spec: ${SLUG}\n\n## Outcome\n\nThe overdue rate is back inside its band, and the cause is named in a test.\n\n`
      + '## Observable behaviours\n\n### B1\n\nGiven an invoice paid in full\nWhen it is checked for overdue status\nThen it is not overdue\n\n'
      + '## Out of scope\n\nThe band itself is not retuned here.\n'));
    writeFileSync(path.join(dir, 'plan.md'), a.render({ status: 'draft' },
      `# Plan: ${SLUG}\n\n## Approach\n\nFix the predicate the breach implicates.\n\n`
      + '## Files\n\n`src/ledger.mjs`\n\n## Order\n\n1. Add a failing test in `test/ledger.test.mjs`.\n2. Fix `src/ledger.mjs`.\n\n'
      + '## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n| B1 | `test/ledger.test.mjs` |\n'));
    mkdirSync(path.join(p.root, 'test'), { recursive: true });
    writeFileSync(path.join(p.root, 'test/ledger.test.mjs'), "import { test } from 'node:test';\ntest('overdue', () => {});\n");
    p.git('add', '-A');
    p.git('commit', '-qm', 'triage the breach into a spec and a plan');

    // Gate 1 and gate 2. Under G07 the source binding informs rather than refuses — and here it
    // is present anyway, which is the point of G19: the breach produced a bindable intent.
    a.approve(cfg, SLUG, 'spec', { by: 'the on-call engineer' });
    p.git('add', '-A');
    p.git('commit', '-qm', 'spec approved');
    a.approve(cfg, SLUG, 'plan', { by: 'the on-call engineer' });
    p.git('add', '-A');
    p.git('commit', '-qm', 'plan approved');

    const state = a.state(cfg, SLUG);
    assert.equal(state.artifacts.spec.state, 'approved');
    assert.equal(state.artifacts.plan.state, 'approved');
    assert.deepEqual(state.issues, [], state.issues.join('; '));

    // And the driver accepts it: the change a breach started is an ordinary change from here.
    const turns = [];
    const result = await deliver(cfg, SLUG, {
      live: true,
      async invoke({ phase }) { turns.push(phase); return { ok: true, usd: 0.01, sessionId: 's', transcript: '' }; },
      async check(stage) { return { stage, ok: true, controls: [] }; },
      async review(options) {
        writeFileSync(path.resolve(p.root, options.output), '# Independent review\n\n## Verdict\n\napprove\n');
        return { status: 'complete', output: options.output, usd: 0, export: { scope: 'plan', files: 3 } };
      },
      async openPr() { return { url: 'https://example.invalid/pull/1' }; },
    });

    assert.equal(result.ok, true, JSON.stringify(result.stopped));
    assert.deepEqual(result.completed, PHASES, 'the driver refused a change the maintain edge produced');
    assert.deepEqual(turns, ['implement']);
    // The loop is closed and still has its gates: the driver approved nothing on the way through.
    assert.notEqual(a.read(cfg, SLUG, 'review')?.front.status, 'approved');
    assert.equal(a.read(cfg, SLUG, 'spec').front.by, 'the on-call engineer');
  } finally { p.cleanup(); }
});

test('a quiet band writes nothing, and a human edit to a breach intent survives the next run', () => {
  const p = project();
  try {
    const quiet = spawnSync(process.execPath, [SCRIPT], { cwd: p.root, encoding: 'utf8',
      input: JSON.stringify({ bands: [{ metric: 'overdue_rate', observed: 0.13, mean: 0.12, stdev: 0.04 }] }) });
    assert.equal(quiet.status, 0);
    assert.match(quiet.stdout, /PASS/);
    assert.deepEqual(readdirSync(path.join(p.root, '.claude/harness/artifacts')), []);

    // 2σ diagnoses and does not ask for work: an intent is a request, and one noisy sample is not.
    const watch = spawnSync(process.execPath, [SCRIPT], { cwd: p.root, encoding: 'utf8',
      input: JSON.stringify({ bands: [{ metric: 'overdue_rate', observed: 0.21, mean: 0.12, stdev: 0.04 }] }) });
    assert.match(watch.stdout, /WATCH/);
    assert.deepEqual(readdirSync(path.join(p.root, '.claude/harness/artifacts')), []);

    assert.equal(detect(p.root, 'bands.json').status, 0);
    const intent = path.join(p.root, '.claude/harness/artifacts', SLUG, 'intent.md');
    const triaged = `${readFileSync(intent, 'utf8')}\nHuman triage: the batch job runs twice on Mondays.\n`;
    writeFileSync(intent, triaged);
    assert.equal(detect(p.root, 'bands.json').status, 0);
    assert.equal(readFileSync(intent, 'utf8'), triaged, 'a second breach overwrote a human triage note');
  } finally { p.cleanup(); }
});
