import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { check } from '../.aidlc/lib/runner.mjs';
import { parse, render, bodyDigest, clearSelection, selectChange } from '../.aidlc/lib/artifacts.mjs';
import { prChange } from '../.aidlc/lib/diff.mjs';

const CLI = path.resolve('.aidlc/bin/harness');

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = root => { git(root, 'add', '-A'); git(root, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'candidate test'); return git(root, 'rev-parse', 'HEAD'); };
const config = root => ({ ...loadConfig(root), stages: { candidate: ['scope-drift'] } });
const findings = report => report.controls.flatMap(c => c.findings);
const candidateCheck = (root, base, extra = {}) => check(config(root), {
  stage: 'candidate', base, candidate: git(root, 'rev-parse', 'HEAD'), write: false, ...extra,
});
// Simulated fixture approvals only; never used as approval of this repository's change.
function amendArtifact(root, kind, edit, { seal = true, slug = 'hyphen-titlecase' } = {}) {
  const file = path.join(root, '.aidlc/artifacts', slug, `${kind}.md`);
  const old = parse(readFileSync(file, 'utf8'));
  const body = edit(old.body);
  writeFileSync(file, render({ ...old.front, ...(seal ? { digest: bodyDigest(render({}, body)) } : {}) }, body));
}

test('B1: committed out-of-scope product change fails in a clean checkout', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    writeFileSync(path.join(s.work, 'src/app/handlers.py'), '# outside approved scope\n');
    const candidate = commit(s.work);
    assert.equal(git(s.work, 'status', '--porcelain'), '');
    const result = await check(config(s.work), { stage: 'candidate', base, candidate, write: false });
    assert.equal(result.ok, false);
    assert.ok(result.controls.some(c => c.findings.some(f => f.file === 'src/app/handlers.py' && f.rule === 'scope-drift')));
  } finally { s.cleanup(); }
});

test('B1/B5: multiple commits, resolved revision evidence and forced scope on an empty stage', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# owned first commit\n');
    commit(s.work);
    writeFileSync(path.join(s.work, 'tests/test_app.py'), '# owned second commit\n');
    const candidate = commit(s.work);
    const cfg = { ...config(s.work), stages: { empty: [] } };
    const result = await check(cfg, { stage: 'empty', base: 'HEAD~2', candidate: 'HEAD', change: 'hyphen-titlecase' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.changed_files, ['src/app/text.py', 'tests/test_app.py']);
    assert.deepEqual(result.revision, { base, candidate, change: 'hyphen-titlecase' });
    assert.deepEqual(result.controls.map(c => c.control), ['scope-drift']);
    assert.deepEqual(JSON.parse(readFileSync(cfg.layout.lastCheck)).revision, result.revision);
    const ledger = readFileSync(cfg.layout.ledger, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(ledger.at(-1).revision, result.revision);
  } finally { s.cleanup(); }
});

test('B2: candidate additions, deletions and rename endpoints preserve unusual path names', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    const odd = 'src/app/space tab\tnewline\n$(touch PWNED).py';
    renameSync(path.join(s.work, 'src/app/text.py'), path.join(s.work, odd));
    unlinkSync(path.join(s.work, 'src/app/handlers.py'));
    commit(s.work);
    const result = await candidateCheck(s.work, base);
    assert.equal(result.ok, false);
    assert.ok(result.changed_files.includes('src/app/text.py'));
    assert.ok(findings(result).some(f => f.file === odd && f.rule === 'scope-drift'));
    assert.ok(findings(result).some(f => f.file === 'src/app/handlers.py'));
    assert.equal(existsSync(path.join(s.work, 'PWNED')), false);
  } finally { s.cleanup(); }
});

test('B2: moving an unowned source into an owned destination still fails', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    unlinkSync(path.join(s.work, 'src/app/text.py'));
    renameSync(path.join(s.work, 'src/app/handlers.py'), path.join(s.work, 'src/app/text.py'));
    commit(s.work);
    assert.ok(findings(await candidateCheck(s.work, base)).some(f => f.file === 'src/app/handlers.py'));
  } finally { s.cleanup(); }
});

test('B2: owned rename endpoints and an owned deletion pass', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    amendArtifact(s.work, 'plan', body => body.replace('## Files', '## Files\n\n- `src/app/new.py`\n- `src/app/handlers.py`'));
    const base = commit(s.work);
    renameSync(path.join(s.work, 'src/app/text.py'), path.join(s.work, 'src/app/new.py'));
    unlinkSync(path.join(s.work, 'src/app/handlers.py'));
    commit(s.work);
    assert.equal((await candidateCheck(s.work, base)).ok, true);
  } finally { s.cleanup(); }
});

test('B3: missing/invalid refs, HEAD mismatch and dirty index/worktree fail closed', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# owned\n');
    commit(s.work);
    for (const extra of [{ base: undefined }, { candidate: undefined }, { base: true }, { candidate: 'absent-ref' }, { base: '--help' }, { candidate: base }]) {
      const result = await candidateCheck(s.work, base, extra);
      assert.equal(result.ok, false, JSON.stringify(extra));
      assert.equal(result.controls[0].verdict, 'errored');
    }
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# dirty owned\n');
    assert.equal((await candidateCheck(s.work, base)).controls[0].verdict, 'errored');
    git(s.work, 'add', 'src/app/text.py');
    assert.equal((await candidateCheck(s.work, base)).controls[0].verdict, 'errored');
  } finally { s.cleanup(); }
});

test('B3: invocation selection never persists and cannot borrow a plan', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = config(s.work);
    const binding = path.join(git(s.work, 'rev-parse', '--absolute-git-dir'), 'aidlc-change.json');
    const before = readFileSync(binding, 'utf8');
    const base = git(s.work, 'rev-parse', 'HEAD');
    for (const change of ['missing', '../hyphen-titlecase', true]) {
      assert.equal((await candidateCheck(s.work, base, { change })).ok, false);
    }
    assert.equal(readFileSync(binding, 'utf8'), before);
    clearSelection(cfg);
    assert.equal((await candidateCheck(s.work, base)).ok, false, 'even an empty candidate needs authority');
    assert.equal((await candidateCheck(s.work, base, { change: 'hyphen-titlecase' })).ok, true);
    assert.equal(existsSync(binding), false);
    const dir = path.join(s.work, '.aidlc/artifacts/other');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Other\n');
    commit(s.work);
    assert.equal((await candidateCheck(s.work, base, { change: 'other' })).ok, false);
  } finally { s.cleanup(); }
});

for (const kind of ['spec', 'plan']) {
  for (const state of ['stale', 'draft', 'missing', 'uncommitted']) {
    test(`B3: ${state} ${kind} approval grants no candidate authority`, async () => {
      const s = stage(FIXTURES, 'contract-planned');
      try {
        const base = git(s.work, 'rev-parse', 'HEAD');
        const file = path.join(s.work, `.aidlc/artifacts/hyphen-titlecase/${kind}.md`);
        if (state === 'missing') unlinkSync(file);
        else if (state === 'draft') writeFileSync(file, readFileSync(file, 'utf8').replace('status: approved', 'status: draft'));
        else amendArtifact(s.work, kind, body => body + '\nChanged after approval.\n', { seal: state === 'uncommitted' });
        if (state !== 'uncommitted') commit(s.work);
        assert.equal((await candidateCheck(s.work, base)).ok, false);
      } finally { s.cleanup(); }
    });
  }
}

test('B3: closed selection fails and untracked proof cannot satisfy a candidate promise', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    const proof = path.join(s.work, 'tests/test_app.py');
    const content = readFileSync(proof);
    unlinkSync(proof);
    commit(s.work);
    writeFileSync(proof, content);
    const result = await candidateCheck(s.work, base);
    assert.ok(findings(result).some(f => f.rule === 'unkept-proof'));
    const intent = path.join(s.work, '.aidlc/artifacts/hyphen-titlecase/intent.md');
    writeFileSync(intent, readFileSync(intent, 'utf8').replace('status: draft', 'status: closed'));
    commit(s.work);
    assert.equal((await candidateCheck(s.work, base, { change: 'hyphen-titlecase' })).ok, false);
  } finally { s.cleanup(); }
});

test('B5: tamper and secrets inspect the same committed candidate including unusual paths', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const deleted = 'tests/tab\tdelete\n.test.js';
    writeFileSync(path.join(s.work, deleted), 'test();\n');
    const base = commit(s.work);
    unlinkSync(path.join(s.work, deleted));
    const odd = 'src/app/new\n\t.py';
    writeFileSync(path.join(s.work, odd), 'value = 1  # ' + 'noqa\n');
    writeFileSync(path.join(s.work, 'src/app/text.py'), 'sk-' + 'Q'.repeat(30) + '\n');
    const candidate = commit(s.work);
    const cfg = { ...config(s.work), capabilities: {}, stages: { candidate: ['scope-drift', 'tamper', 'secrets'] } };
    const result = await check(cfg, { stage: 'candidate', base, candidate, all: true, write: false });
    assert.ok(findings(result).some(f => f.rule === 'bare-suppression' && f.file === odd));
    assert.ok(findings(result).some(f => f.rule === 'deleted-test' && f.file === deleted));
    assert.ok(findings(result).some(f => f.rule === 'openai-key' && f.file === 'src/app/text.py'));
  } finally { s.cleanup(); }
});

test('B6: CI command uses PR head, merge base and explicit event selection; rejects ambiguous input', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    git(s.work, 'checkout', '-qb', 'target');
    writeFileSync(path.join(s.work, 'src/app/handlers.py'), '# unrelated target change\n');
    const target = commit(s.work);
    git(s.work, 'checkout', '-qb', 'feature', base);
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# owned feature change\n');
    const candidate = commit(s.work);
    git(s.work, 'checkout', '--detach', candidate);
    clearSelection(config(s.work));
    const mergeBase = git(s.work, 'merge-base', target, candidate);
    assert.equal(mergeBase, base);
    const event = path.join(s.work, '.aidlc/state/pr-event.json');
    const cli = (...extra) => spawnSync(process.execPath, [CLI, 'check', '--stage', 'fast', '--base', mergeBase,
      '--candidate', candidate, '--pr-event', event, '--json', ...extra], { cwd: s.work, encoding: 'utf8' });
    writeFileSync(event, JSON.stringify({ pull_request: { body: 'Review this.\nHarness-Change: hyphen-titlecase\n' } }));
    const good = cli();
    assert.equal(good.status, 0, good.stderr + good.stdout);
    const report = JSON.parse(good.stdout);
    assert.deepEqual(report.revision, { base, candidate, change: 'hyphen-titlecase' });
    assert.deepEqual(report.changed_files, ['src/app/text.py']);
    for (const body of ['', 'Harness-Change: hyphen-titlecase\nHarness-Change: other', 'Harness-Change: ../oops']) {
      writeFileSync(event, JSON.stringify({ pull_request: { body } }));
      const bad = cli();
      assert.notEqual(bad.status, 0);
      assert.match(bad.stderr, /exactly one line/);
    }
    assert.throws(() => prChange('Harness-Change: $(touch PWNED)'), /exactly one/);
  } finally { s.cleanup(); }
});

test('B2/B5: configured tools receive literal paths and cannot narrow the candidate diff', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    const odd = "src/app/single' quote $(touch PWNED) `touch ALSO_PWNED` {files} {report} $&\t\n.py";
    writeFileSync(path.join(s.work, odd), '# outside scope\n');
    const candidate = commit(s.work);
    const cfg = { ...config(s.work), stages: { candidate: ['lint'] }, capabilities: {
      lint: `node -e 'require("fs").writeFileSync(".aidlc/state/args.json", JSON.stringify(process.argv.slice(1)))' -- {files}`,
    } };
    const result = await check(cfg, { stage: 'candidate', base, candidate, files: ['src/app/text.py'], all: true, write: false });
    assert.equal(result.ok, false);
    assert.deepEqual(result.changed_files, [odd]);
    assert.deepEqual(JSON.parse(readFileSync(path.join(s.work, '.aidlc/state/args.json'))), [odd]);
    assert.equal(existsSync(path.join(s.work, 'PWNED')), false);
    assert.equal(existsSync(path.join(s.work, 'ALSO_PWNED')), false);
  } finally { s.cleanup(); }
});

test('B5: invalid candidate setup is saved as an error and never runs later controls with --all', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = { ...config(s.work), stages: { candidate: ['lint'] }, capabilities: { lint: 'touch SHOULD_NOT_RUN' } };
    const result = await check(cfg, { stage: 'candidate', base: 'missing-ref', candidate: 'HEAD', all: true });
    assert.equal(result.ok, false);
    assert.equal(result.controls[0].verdict, 'errored');
    assert.equal(result.controls[1].verdict, 'skipped');
    assert.equal(existsSync(path.join(s.work, 'SHOULD_NOT_RUN')), false);
    assert.equal(JSON.parse(readFileSync(cfg.layout.lastCheck)).ok, false);
    assert.equal(JSON.parse(readFileSync(cfg.layout.ledger, 'utf8').trim().split('\n').at(-2)).verdict, 'errored');
  } finally { s.cleanup(); }
});

test('B6: the actual CI shell pipeline retains failure and revision evidence through tee', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const workflow = readFileSync(path.resolve('.github/workflows/harness.yml'), 'utf8');
    const block = /- name: Check the actual PR candidate\n([\s\S]*?)\n      - if: always\(\)/.exec(workflow)[1];
    const script = block.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
    const base = git(s.work, 'rev-parse', 'HEAD');
    writeFileSync(path.join(s.work, 'src/app/handlers.py'), '# out of scope in CI\n');
    const candidate = commit(s.work);
    const event = path.join(s.work, '.aidlc/state/pr-event.json');
    writeFileSync(event, JSON.stringify({ pull_request: { body: 'Harness-Change: hyphen-titlecase' } }));
    // GitHub's explicit `shell: bash` enables pipefail; execute that same shell contract.
    assert.match(block, /shell: bash/);
    const invoke = () => spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
      cwd: s.work, encoding: 'utf8', env: { ...process.env, TARGET_SHA: base, CANDIDATE_SHA: candidate,
        GITHUB_EVENT_PATH: event, HARNESS_HOME: path.resolve('.aidlc') },
    });
    const result = invoke();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    const log = readFileSync(path.join(s.work, '.aidlc/state/pr-scope.log'), 'utf8');
    assert.match(log, /scope-drift/);
    assert.equal(JSON.parse(log).revision.candidate, candidate);
    const identity = readFileSync(path.join(s.work, '.aidlc/state/pr-revisions.txt'), 'utf8');
    assert.ok(identity.includes(`base=${base}`));
    writeFileSync(event, JSON.stringify({ pull_request: { body: '' } }));
    assert.notEqual(invoke().status, 0);
    assert.match(readFileSync(path.join(s.work, '.aidlc/state/pr-scope.log'), 'utf8'), /exactly one line/);
  } finally { s.cleanup(); }
});

test('B3: an untracked intent cannot create candidate authority beside committed approvals', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const base = git(s.work, 'rev-parse', 'HEAD');
    const intent = path.join(s.work, '.aidlc/artifacts/hyphen-titlecase/intent.md');
    const content = readFileSync(intent);
    unlinkSync(intent);
    commit(s.work);
    writeFileSync(intent, content);
    assert.equal((await candidateCheck(s.work, base)).ok, false);
    assert.equal((await candidateCheck(s.work, base, { change: 'hyphen-titlecase' })).ok, false);
  } finally { s.cleanup(); }
});

test('B3: malformed CLI revision options fail instead of falling back to a local check', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    for (const options of [
      ['--base=HEAD', '--candidate=HEAD'], ['--base', 'HEAD'], ['--candidate', 'HEAD'],
      ['--base', 'HEAD', '--candidate'], ['--base', 'HEAD', '--base', 'HEAD', '--candidate', 'HEAD'],
      ['--change', 'hyphen-titlecase'],
    ]) {
      const result = spawnSync(process.execPath, [CLI, 'check', '--stage', 'fast', ...options], { cwd: s.work, encoding: 'utf8' });
      assert.notEqual(result.status, 0, options.join(' '));
    }
  } finally { s.cleanup(); }
});
