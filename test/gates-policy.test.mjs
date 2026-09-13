// G06. `[gates]` makes a gate a policy rather than a constant: `human` refuses, `advisory`
// reports and lets the loop continue, `auto` records the approval the configuration gave.
//
// The rest of the suite pins `human` wherever it asserts a refusal, so it measures that the
// enforcing mode did not move. This file is the other half: that `advisory` reports the same
// judgment without blocking, that `auto` records an approval nobody can pretend a human gave,
// and that the rules which are not gates — destructive commands, `protected-path`,
// `prefix-cache`, `tamper`, `secrets`, `approve-is-the-humans` — are untouched by any of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, gateMode, gateBlocks, DEFAULT_GATES } from '../.aidlc/lib/config.mjs';
import { writeRefusal, writeBlocked, bashContractRefusal, bashContractBlocked } from '../.aidlc/lib/guard.mjs';
import { run as scopeDrift } from '../.aidlc/checks/scope-drift.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';
import { read as readLedger } from '../.aidlc/lib/ledger.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';
import { HUMAN, ADVISORY, AUTO } from './_gates.mjs';
import { BIN } from './_paths.mjs';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });
const modes = (root, gates) => ({ ...loadConfig(root), gates });

// `contract-planned` selects `hyphen-titlecase`, whose approved plan owns `src/app/text.py` and
// `tests/test_app.py` and nothing else. `src/app/handlers.py` is the unowned path throughout.
const OWNED = 'src/app/text.py';
const UNOWNED = 'src/app/handlers.py';

test('a mode that nobody chose is refused at load, and merge takes exactly one value', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gates-cfg-'));
  const toml = path.join(root, '.aidlc/harness.toml');
  mkdirSync(path.dirname(toml), { recursive: true });
  const load = (gates) => { writeFileSync(toml, `[project]\nname = "g"\n${gates}`); return loadConfig(root); };
  try {
    // Saying nothing gets the documented default rather than whatever the first comparison in
    // the code happened to be written against.
    assert.deepEqual(load('').gates, DEFAULT_GATES);
    assert.deepEqual(load('[gates]\nspec = "human"\n').gates, { ...DEFAULT_GATES, spec: 'human' });

    // A typo must not read as a mode. `advisroy` silently meaning "not human" is the whole
    // failure this refusal exists to prevent.
    assert.throws(() => load('[gates]\nspec = "advisroy"\n'), /not a mode/);
    assert.throws(() => load('[gates]\nplan = "off"\n'), /not a mode/);
    assert.throws(() => load('[gates]\nreview = "auto"\n'), /unknown gate/);

    // Law 8's one fixed point: the harness never approves its own merge.
    assert.throws(() => load('[gates]\nmerge = "auto"\n'), /merge must be "human"/);
    assert.throws(() => load('[gates]\nmerge = "advisory"\n'), /merge must be "human"/);
    assert.equal(load('[gates]\nmerge = "human"\n').gates.merge, 'human');

    // A cfg built by hand means the same thing as one built by loadConfig. Before G06 no cfg
    // carried a mode at all, and half the callers in this repository construct their own.
    assert.equal(gateMode({}, 'plan'), DEFAULT_GATES.plan);
    assert.equal(gateMode(undefined, 'spec'), DEFAULT_GATES.spec);
    assert.equal(gateBlocks({ gates: HUMAN }, 'plan'), true);
    assert.equal(gateBlocks({ gates: ADVISORY }, 'plan'), false);
    // `auto` does not block either: the driver records the approval as it goes, so there is
    // nothing left to wait for.
    assert.equal(gateBlocks({ gates: AUTO }, 'plan'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an advisory plan gate reports the same judgment the human gate refuses, and lets the write through', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const human = modes(s.work, HUMAN), advisory = modes(s.work, ADVISORY);

    const refused = writeRefusal(UNOWNED, human);
    const advised = writeRefusal(UNOWNED, advisory);

    // Same rule, same words. An advisory gate that explained itself differently would be a
    // second implementation of what `## Files` means.
    assert.equal(refused.rule, 'write-scope');
    assert.equal(advised.rule, 'write-scope');
    assert.equal(advised.message, refused.message);
    assert.equal(refused.advisory, false);
    assert.equal(advised.advisory, true);

    // The question every existing caller asks — may this write proceed — answers differently.
    assert.match(String(writeBlocked(UNOWNED, human)), /hyphen-titlecase/);
    assert.equal(writeBlocked(UNOWNED, advisory), null, 'an advisory gate does not refuse');

    // An owned path was never in question under either mode.
    assert.equal(writeBlocked(OWNED, human), null);
    assert.equal(writeBlocked(OWNED, advisory), null);

    // Same again through the shell, which must not be able to disagree with Write and Edit.
    assert.match(String(bashContractBlocked(`echo x > ${UNOWNED}`, human)), /hyphen-titlecase/);
    assert.equal(bashContractBlocked(`echo x > ${UNOWNED}`, advisory), null);
    assert.equal(bashContractRefusal(`echo x > ${UNOWNED}`, advisory).advisory, true);
  } finally { s.cleanup(); }
});

// The rules listed in the plan as unaffected. A mode that relaxed these would be a mode that
// turned the guard off, which is what `require_contract = false` already did once and what the
// refusal wording was rewritten to stop an agent doing.
test('advisory relaxes the gates and nothing else', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const advisory = modes(s.work, ADVISORY);

    const registry = writeRefusal('.aidlc/harness.toml', advisory);
    assert.equal(registry.rule, 'protected-path');
    assert.equal(registry.advisory, false, 'a protected path is not a gate');
    assert.match(String(writeBlocked('.aidlc/harness.toml', advisory)), /protected_paths/);

    const prefix = writeRefusal('.claude/CLAUDE.md', advisory);
    assert.equal(prefix.rule, 'prefix-cache');
    assert.equal(prefix.advisory, false, 'the prompt prefix is not a gate');

    // A command that writes to both an out-of-scope path and a protected one denies. Returning
    // whichever hit came first in token order would make the denial depend on the order the
    // shell happened to write its redirections in.
    const both = bashContractRefusal(`echo x > ${UNOWNED}; echo y > .aidlc/harness.toml`, advisory);
    assert.equal(both.rule, 'protected-path');
    assert.equal(both.advisory, false);
    assert.ok(bashContractBlocked(`echo x > ${UNOWNED}; echo y > .aidlc/harness.toml`, advisory));

    // And the reverse order, so this is a property of the verdicts rather than of the string.
    assert.equal(bashContractRefusal(`echo y > .aidlc/harness.toml; echo x > ${UNOWNED}`, advisory).rule, 'protected-path');
  } finally { s.cleanup(); }
});

test('scope-drift warns under an advisory gate, and an unkept proof still fails', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, UNOWNED), '# outside the approved scope\n');

    const strict = await scopeDrift(modes(s.work, HUMAN));
    assert.equal(strict.verdict, 'fail');
    assert.ok(strict.findings.some((f) => f.file === UNOWNED && f.rule === 'scope-drift'));

    const relaxed = await scopeDrift(modes(s.work, ADVISORY));
    // Reported, not silenced. A relaxed gate recording `pass` would be indistinguishable from a
    // gate that was satisfied, and then nothing reaches the merge decision at all.
    assert.equal(relaxed.verdict, 'warn');
    assert.deepEqual(relaxed.findings, strict.findings, 'the same findings, at a different severity');
    assert.ok(relaxed.findings.every((f) => !('gate' in f)), 'the gate tag is routing, not part of the finding schema');

    // An approved plan promising a test that does not exist is a broken promise inside a gate
    // that was already given, not a gate still waiting for an answer. No mode relaxes it.
    const planFile = a.file(modes(s.work, ADVISORY), 'hyphen-titlecase', 'plan');
    const plan = a.parse(readFileSync(planFile, 'utf8'));
    writeFileSync(planFile, a.render(
      { ...plan.front, digest: a.bodyDigest(a.render({}, plan.body + '\n| B9 | `tests/test_never_written.py` |\n')) },
      plan.body + '\n| B9 | `tests/test_never_written.py` |\n'));
    git(s.work, 'add', '-A'); git(s.work, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'plan promises a test that does not exist');

    const unkept = await scopeDrift(modes(s.work, ADVISORY));
    assert.equal(unkept.verdict, 'fail', 'an unkept proof is not a gate and advisory does not reach it');
    assert.ok(unkept.findings.some((f) => f.rule === 'unkept-proof'));
  } finally { s.cleanup(); }
});

// The PR check's half of the acceptance: under advisory the candidate check annotates — real
// findings, named rule, and a report that does not fail — where under `human` it refuses.
test('a candidate check annotates under advisory and fails under human', async () => {
  const { check } = await import('../.aidlc/lib/runner.mjs');
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    writeFileSync(path.join(s.work, UNOWNED), '# outside the approved scope\n');
    git(s.work, 'add', '-A'); git(s.work, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'out of scope');
    const candidate = git(s.work, 'rev-parse', 'HEAD');
    const at = (gates) => check({ ...modes(s.work, gates), stages: { candidate: ['scope-drift'] } },
      { stage: 'candidate', base, candidate, write: false });

    const strict = await at(HUMAN);
    assert.equal(strict.ok, false);
    assert.equal(strict.controls.find((c) => c.control === 'scope-drift').verdict, 'fail');

    const relaxed = await at(ADVISORY);
    const control = relaxed.controls.find((c) => c.control === 'scope-drift');
    assert.equal(control.verdict, 'warn');
    assert.ok(control.findings.some((f) => f.file === UNOWNED && f.rule === 'scope-drift'),
      'the annotation carries the same file and rule the refusal did');
    assert.equal(relaxed.ok, true, 'an advisory gate annotates the candidate rather than failing it');
  } finally { s.cleanup(); }
});

test('the write hook warns instead of denying, and records a warn row rather than a fail', async () => {
  const { dispatch } = await import('../.aidlc/hooks/dispatch.mjs');
  const s = stage(FIXTURES, 'contract-planned');
  try {
    appendFileSync(path.join(s.work, '.aidlc/harness.toml'), '\n[gates]\nspec = "advisory"\nplan = "advisory"\n');

    const ask = async (file) => {
      const chunks = [];
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = (text) => { chunks.push(String(text)); return true; };
      const stdin = process.stdin;
      const { Readable } = await import('node:stream');
      Object.defineProperty(process, 'stdin', { value: Readable.from([JSON.stringify({ cwd: s.work, tool_name: 'Write', tool_input: { file_path: file } })]), configurable: true });
      try { await dispatch('pre-tool'); } finally {
        process.stdout.write = write;
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
      }
      return JSON.parse(chunks.join('') || '{}');
    };

    const out = await ask(UNOWNED);
    const hook = out.hookSpecificOutput ?? {};
    assert.equal(hook.permissionDecision, undefined, 'an advisory gate must not deny');
    assert.match(hook.additionalContext, /advisory gate/);
    assert.match(hook.additionalContext, /hyphen-titlecase/, 'the warning still says what is out of scope');
    assert.match(hook.additionalContext, /recorded, not refused/);

    const rows = readLedger({ ledger: path.join(s.work, '.aidlc/state/ledger.jsonl') })
      .filter((r) => r.control === 'write-guard');
    const fired = rows.filter((r) => r.rule === 'write-scope');
    assert.equal(fired.length, 1);
    // `harness ledger audit` counts fires to tell a deterrent from a corpse. A warning that
    // recorded itself as a denial would inflate exactly the number that decides what stays.
    assert.equal(fired[0].verdict, 'warn');
    assert.ok(!rows.some((r) => r.verdict === 'fail'), 'nothing was refused');
  } finally { s.cleanup(); }
});

test('status shows a relaxed approval as a row and exits 0; the same state under human is an error and exits 1', () => {
  const s = stage(FIXTURES, 'contract-planned');
  const toml = path.join(s.work, '.aidlc/harness.toml');
  const withGates = (mode) => {
    const text = readFileSync(toml, 'utf8').replace(/\n\[gates\][\s\S]*$/, '');
    writeFileSync(toml, `${text}\n[gates]\nspec = "${mode}"\nplan = "${mode}"\nmerge = "human"\n`);
  };
  try {
    // Edit an approved spec so its body no longer matches the digest a human signed.
    const cfg = loadConfig(s.work);
    const spec = a.file(cfg, 'hyphen-titlecase', 'spec');
    writeFileSync(spec, readFileSync(spec, 'utf8') + '\nAdded after approval.\n');
    git(s.work, 'add', '-A'); git(s.work, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'edit after approval');

    withGates('human');
    const strict = cli(s.work, 'status', 'hyphen-titlecase');
    assert.equal(strict.status, 1, strict.stdout + strict.stderr);
    assert.match(strict.stdout, /ERROR hyphen-titlecase: spec\.md changed after it was approved/);

    withGates('advisory');
    const relaxed = cli(s.work, 'status', 'hyphen-titlecase');
    assert.equal(relaxed.status, 0, relaxed.stdout + relaxed.stderr);
    // The same observation, as a row. Losing it entirely would be the failure mode advisory
    // mode is accused of; keeping it as an error would be the mode not existing.
    assert.match(relaxed.stdout, /ADVISORY hyphen-titlecase: spec\.md changed after it was approved/);
    assert.doesNotMatch(relaxed.stdout, /^ *ERROR /m);
    assert.match(relaxed.stdout, /stale-approval/, 'the state column still tells the truth');

    const json = JSON.parse(cli(s.work, 'status', 'hyphen-titlecase', '--json').stdout);
    const row = json.changes.find((r) => r.slug === 'hyphen-titlecase');
    assert.deepEqual(row.issues, [], 'nothing blocking under advisory');
    assert.ok(row.advisories.some((t) => /changed after it was approved/.test(t)));
    assert.equal(row.ok, true);
  } finally { s.cleanup(); }
});

test('only an auto gate records a policy approval, and it says so in the frontmatter', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const at = (gates) => modes(s.work, gates);
    const slug = 'hyphen-titlecase';
    // `contract-planned` ships a legacy binding, so give the fixture the v2 inputs an approval
    // needs before asking anything about who gave it. The same preparation
    // `requirement-traceability` does, for the same reason.
    const commitAll = () => { git(s.work, 'add', '-A'); git(s.work, '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'gates fixture'); };
    const edit = (cfg, kind, fn) => writeFileSync(a.file(cfg, slug, kind), fn(readFileSync(a.file(cfg, slug, kind), 'utf8')));
    const seed = at(AUTO);
    edit(seed, 'intent', (text) => {
      const { front, body } = a.parse(text);
      return a.render({ ...front, source: 'src/app/text.py', source_revision: git(s.work, 'rev-parse', 'HEAD') }, body);
    });
    edit(seed, 'spec', (text) => text + '\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n| local:hyphens | B1 |\n| local:spaces | B2 |\n');
    commitAll();

    for (const gates of [HUMAN, ADVISORY]) {
      assert.throws(() => a.approve(at(gates), slug, 'spec', { by: 'tester', policy: true }),
        /only "auto" records a policy approval/,
        `${gates.spec} mode fabricated a decision nobody made`);
    }

    const cfg = at(AUTO);
    assert.equal(a.read(cfg, slug, 'spec').front.approved_by, undefined);

    const result = a.approve(cfg, slug, 'spec', { by: 'harness-deliver', policy: true });
    const after = a.read(cfg, slug, 'spec').front;
    assert.equal(after.status, 'approved');
    // `by` stays the audit label a reader can chase. A record that quietly put "policy" there
    // would look exactly like a person named policy.
    assert.equal(after.by, 'harness-deliver');
    assert.equal(after.approved_by, 'policy');
    assert.match(after.policy_digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(after.policy_digest, a.policyDigest(cfg, 'spec'));
    assert.ok(after.at, 'a policy approval is still timestamped');
    assert.ok(result.digest);
    assert.equal(a.read(cfg, slug, 'spec').state, 'approved');

    // The digest covers the mode, so an approval taken under a different policy is a different
    // record — an approval justified only by "the configuration said so" has to say what it was.
    assert.notEqual(a.policyDigest(cfg, 'spec'), a.policyDigest(at(HUMAN), 'spec'));
    assert.notEqual(a.policyDigest(cfg, 'spec'), a.policyDigest(cfg, 'plan'));
  } finally { s.cleanup(); }
});

test('the agent still cannot approve through its own shell, in any mode', async () => {
  const { dispatch } = await import('../.aidlc/hooks/dispatch.mjs');
  const home = mkdtempSync(path.join(tmpdir(), 'gates-approve-'));
  mkdirSync(path.join(home, '.aidlc'), { recursive: true });
  const had = process.env.AIDLC_UNATTENDED;
  delete process.env.AIDLC_UNATTENDED;
  try {
    for (const mode of ['human', 'advisory', 'auto']) {
      writeFileSync(path.join(home, '.aidlc/harness.toml'), `[project]\nname = "g"\n[gates]\nspec = "${mode}"\nplan = "${mode}"\n`);
      const chunks = [];
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = (text) => { chunks.push(String(text)); return true; };
      const stdin = process.stdin;
      const { Readable } = await import('node:stream');
      Object.defineProperty(process, 'stdin', { value: Readable.from([JSON.stringify({ cwd: home, tool_name: 'Bash', tool_input: { command: 'node .aidlc/bin/harness approve x plan --by me --policy' } })]), configurable: true });
      try { await dispatch('pre-tool'); } finally {
        process.stdout.write = write;
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
      }
      // `auto` is the driver recording an approval through the library, never the agent typing
      // one into a shell. `approve-is-the-humans` is not a gate and no mode stands it down.
      assert.match(chunks.join(''), /approval is the human/i, `${mode} mode let the agent approve`);
    }
  } finally {
    if (had !== undefined) process.env.AIDLC_UNATTENDED = had;
    rmSync(home, { recursive: true, force: true });
  }
});

// Phase 1's exit criterion, measured rather than asserted: the number of `harness approve`
// commands a change needs between a written intent and a diff that is ready to be reviewed.
// Under `human` it is two, which is the point of the gates; under `advisory` it is zero, which
// is the point of the mode. The PR itself is the driver's job (G09); what is measured here is
// everything up to the diff being written and the commit stage being clean.
test('a change reaches a reviewable diff with two approvals under human and none under advisory', () => {
  const spec = `# Spec: count the approvals

## Outcome

The number of human gate commands a change needs is a property of the configuration.

## Observable behaviours

### B1

Given a change under an advisory gate
When its product file is written
Then no approval command was needed and the write was not refused.
`;
  const plan = `# Plan: count the approvals

## Approach

Write the one file and the one test.

## Files

- \`src/counted.mjs\`

## Order

1. Write \`src/counted.mjs\`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | \`tests/counted.test.mjs\` |
`;

  const measure = (mode) => {
    const root = mkdtempSync(path.join(tmpdir(), `exit-${mode}-`));
    try {
      spawnSync('git', ['init', '-q'], { cwd: root });
      spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
      spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
      assert.equal(cli(root, 'init', '--into', root).status, 0);
      appendFileSync(path.join(root, '.aidlc/harness.toml'), `\n[gates]\nspec = "${mode}"\nplan = "${mode}"\nmerge = "human"\n`);

      assert.equal(cli(root, 'new', 'counted').status, 0);
      const dir = path.join(root, '.aidlc/artifacts/counted');
      writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent: counted\n\nSomething should change.\n');
      writeFileSync(path.join(dir, 'spec.md'), `---\nstatus: draft\n---\n${spec}`);
      writeFileSync(path.join(dir, 'plan.md'), `---\nstatus: draft\n---\n${plan}`);
      const commitAll = (m) => { git(root, 'add', '-A'); git(root, '-c', 'commit.gpgsign=false', 'commit', '-qm', m); };
      commitAll('draft counted');
      assert.equal(cli(root, 'status', '--change', 'counted').status, 0);

      // Approve only what this mode actually requires, and count the commands.
      let approvals = 0;
      for (const kind of ['spec', 'plan']) {
        if (mode !== 'human') continue;
        assert.equal(cli(root, 'approve', 'counted', kind, '--by', 'tester').status, 0);
        approvals += 1;
        commitAll(`${kind} approved`);
      }

      // The product write the change exists to make.
      const cfg = loadConfig(root);
      const refusal = writeBlocked('src/counted.mjs', cfg);
      return { approvals, refusal, advisories: a.state(cfg, 'counted').advisories.length };
    } finally { rmSync(root, { recursive: true, force: true }); }
  };

  const strict = measure('human');
  assert.equal(strict.approvals, 2, 'the human gate costs exactly two approval commands');
  assert.equal(strict.refusal, null, 'and having paid them, the owned path is writable');

  const relaxed = measure('advisory');
  assert.equal(relaxed.approvals, 0, 'the advisory gate costs none');
  assert.equal(relaxed.refusal, null, 'and the write is not refused');
  // Zero refusals is not zero information: the unapproved gates are still on the board.
  assert.ok(relaxed.advisories > 0, 'an advisory gate that said nothing would be a gate that was removed');
});
