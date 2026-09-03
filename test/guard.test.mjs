import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { C, BIN } from './_paths.mjs';
import { writeBlocked, productionDenied, lockTests, clearLock, bashTouchesProtected, bashContractBlocked, writeTargets } from '../.aidlc/lib/guard.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';


function tmp(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  const layout = {
    root,
    aidlc: path.join(root, '.aidlc'),
    claude: path.join(root, '.claude'),
    state: path.join(root, '.aidlc/state'),
  };
  mkdirSync(path.join(root, ".aidlc/artifacts/contracts"), { recursive: true });
  mkdirSync(layout.state, { recursive: true });
  return { root, layout, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// Spec behaviour 14. The old check asked whether the command contained `>` *anywhere* and then
// whether a protected path appeared *anywhere*. `2>&1` supplies the first and any mention of the
// file supplies the second, so reading a protected file was denied. It fired six times against
// read-only commands while this change was being written — including on the attempt to write the
// intent describing it, because the prose named a protected path. A guard that blocks reading is
// one people learn to route around, and a routed-around guard protects nothing.
test('a command that only reads a protected path is allowed', () => {
  const paths = ['.claude/settings.json', '.aidlc/harness.toml', 'CLAUDE.md'];
  for (const cmd of [
    'head -n 30 .claude/settings.json',
    'cat .aidlc/harness.toml 2>&1',
    'grep -n foo .aidlc/harness.toml 2>/dev/null',
    'cat .aidlc/templates/project-instructions.md 2>&1 | head -5',
    'cp ~/.claude/settings.json /tmp/backup.json',
    'node -e "1" > /tmp/out.txt',
  ]) {
    assert.equal(bashTouchesProtected(cmd, paths), null, `denied a read-only command: ${cmd}`);
  }
});

// Spec behaviour 15. Narrowing the guard must not open it. These are the writes it exists for.
test('a command that writes to a protected path is still denied', () => {
  const paths = ['.claude/settings.json', '.aidlc/harness.toml', 'CLAUDE.md'];
  for (const cmd of [
    'echo x > .claude/settings.json',
    'echo x >> .aidlc/harness.toml',
    "sed -i '' s/a/b/ .aidlc/harness.toml",
    'cat x | tee CLAUDE.md',
    'cp /tmp/other.json .claude/settings.json',
    'mv .claude/settings.json /tmp/',
    'truncate -s 0 .aidlc/harness.toml',
  ]) {
    assert.ok(bashTouchesProtected(cmd, paths), `allowed a write to a protected path: ${cmd}`);
  }
});

// p0 B7 of eval-suite-tells-the-truth. The prompt-prefix guard matched `norm.endsWith('/' + p)`,
// so every nested copy counted as the prefix: editing `evals/fixtures/_base/.aidlc/harness.toml`
// — a fixture never read into any prompt — was refused as cache invalidation. `norm` is already
// repo-relative, so identity is the whole test. The control had no unit coverage before this.
test('a nested copy of a prompt-prefix file is not the prompt prefix', () => {
  const f = tmp('prefix-'); try {
    const cfg = { layout: f.layout, guard: {} };
    for (const rel of [
      'evals/fixtures/_base/.aidlc/harness.toml',
      'evals/fixtures/clean-app/.claude/CLAUDE.md',
      'examples/scratch-py/.claude/settings.json',
    ]) assert.equal(writeBlocked(rel, cfg), null, `refused a nested copy: ${rel}`);

    // And the repository's own files are still the prefix. `.aidlc/instructions.md` is on that
    // list because it is what `.claude/CLAUDE.md` is generated from: editing it and re-running
    // init invalidates the cache exactly as editing the generated file would.
    // lean-v2 B6 removed `.aidlc/harness.toml` from this list: it is a registry, not prompt text.
    for (const rel of ['.claude/CLAUDE.md', '.claude/settings.json', '.aidlc/instructions.md']) {
      assert.match(String(writeBlocked(rel, cfg)), /cached prompt prefix/, `stopped guarding ${rel}`);
    }
  } finally { f.cleanup(); }
});

// force-is-not-the-agents-to-give B1/B2. `init` refuses to rewrite a cached-prefix file and says
// to make the change between sessions; `--force` is the human's way past that. On 2026-09-02 the
// agent read the refusal, named the cache miss it would cause, and forced anyway. The pre-bash
// hook sees only commands the agent issues, so denying there leaves a human's own shell alone.
test('the agent cannot force init past the prefix guard, in any spelling', async () => {
  const { dispatch } = await import('../.aidlc/hooks/dispatch.mjs');
  const ask = async (command) => {
    const chunks = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { chunks.push(String(s)); return true; };
    const stdin = process.stdin;
    // dispatch reads the tool call from stdin as JSON.
    const { Readable } = await import('node:stream');
    Object.defineProperty(process, 'stdin', { value: Readable.from([JSON.stringify({ cwd: process.cwd(), tool_input: { command } })]), configurable: true });
    try { await dispatch('pre-bash'); } finally {
      process.stdout.write = write;
      Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
    }
    return chunks.join('');
  };

  for (const cmd of [
    'node .aidlc/bin/harness init --force',
    'bash .aidlc/bin/harness init --into . --force',
    '.aidlc/bin/harness init --force --into .',
  ]) {
    const out = await ask(cmd);
    assert.match(out, /cached prompt prefix/, `allowed: ${cmd}`);
    assert.match(out, /ask the human to run it/i, `no human hand-off named for: ${cmd}`);
  }

  // B2: ordinary init stays available, or the install and upgrade paths close.
  assert.doesNotMatch(await ask('node .aidlc/bin/harness init --into .'), /cached prompt prefix/);

  // B6: an invocation, not a mention. The first version matched the string anywhere and refused
  // the script writing this contract's own evidence, which quoted the rule it was documenting.
  for (const cmd of [
    `node -e "console.log('the rule refuses ${'harness init'} ${'--force'} from the agent')"`,
    `printf '%s' 'documented: ${'harness init'} ${'--force'} is the human route'`,
  ]) {
    assert.doesNotMatch(await ask(cmd), /cached prompt prefix/, `refused a mention, not an invocation: ${cmd}`);
  }
});

// require-contract-defaults-on B1/B2. The default used to be off while the installed template
// set it on, so the control ran for anyone who took the template and not for anyone who did not
// — and the second group was invisible, because a control that is absent looks exactly like a
// control that passed. Every eval fixture was in that group.
test('require_contract defaults on, and an explicit choice still wins', async () => {
  const { loadConfig } = await import('../.aidlc/lib/config.mjs');
  const write = (body) => {
    const root = mkdtempSync(path.join(tmpdir(), 'cfg-'));
    mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    writeFileSync(path.join(root, '.aidlc/harness.toml'), body);
    return root;
  };
  const bare = write('[project]\nname = "x"\n');
  const off = write('[project]\nname = "x"\n\n[guard]\nrequire_contract = false\n');
  try {
    assert.equal(loadConfig(bare).guard.require_contract, true, 'saying nothing gets you the control');
    assert.equal(loadConfig(off).guard.require_contract, false, 'a default is what happens when nobody chose');
  } finally {
    rmSync(bare, { recursive: true, force: true });
    rmSync(off, { recursive: true, force: true });
  }
});

function contractCfg(f) {
  return {
    layout: { ...f.layout, contracts: path.join(f.root, '.aidlc/artifacts/contracts') },
    guard: { require_contract: true },
  };
}

// p0-unblock-the-loop B1. bashContractBlocked was left on the string test that
// bashTouchesProtected had already been repaired for, so it read a `>` anywhere as a write. It
// refused `2>/dev/null`, it refused `harness check --stage stop 2>&1 | tail` — the command
// CLAUDE.md calls non-negotiable — and it refused every commit carrying a `Co-Authored-By`
// trailer, because a mail address ends in `>`. Three separate refusals in the session that
// found it.
test('the contract guard does not block a command that writes no product file', () => {
  const f = tmp('contract-guard-read-'); try {
    const cfg = contractCfg(f);
    for (const cmd of [
      'echo hi 2>/dev/null | head -1',
      'node .aidlc/bin/harness check --stage stop 2>&1 | tail -30',
      'git commit -q -m "fix: x" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"',
      'grep -rn contractScopeState .aidlc/lib 2>/dev/null',
      'ls -la > /dev/null',
      'node .aidlc/bin/harness status >> .aidlc/state/last-check.json',
      // The carve-out is about the artifact and state trees, not about how they were spelled.
      `echo x > ${f.root}/.aidlc/artifacts/intent/foo.md`,
      `echo x > ${f.root}/.aidlc/state/scratch`,
      'echo x > ./.aidlc/state/scratch',
    ]) assert.equal(bashContractBlocked(cmd, cfg), null, `blocked a command that writes no product file: ${cmd}`);
  } finally { f.cleanup(); }
});

// p0-unblock-the-loop B2. Narrowing the guard must not open it.
test('the contract guard still blocks an unowned write to a product file', () => {
  const f = tmp('contract-guard-write-'); try {
    const cfg = contractCfg(f);
    for (const cmd of [
      'echo x > src/app.py',
      'echo x >> src/app.py',
      "sed -i '' s/a/b/ src/app.py",
      'cat x | tee src/app.py',
      'node build.mjs 2>&1 > dist/out.js',
      'cp /tmp/other.py src/app.py',
    ]) assert.ok(bashContractBlocked(cmd, cfg), `allowed an unowned product write: ${cmd}`);
  } finally { f.cleanup(); }
});

test('scope guard remains configurable for non-product repositories', () => {
  const f = tmp('guard-off-'); try {
    assert.equal(writeBlocked('src/app.py', { layout: f.layout, guard: {} }), null);
  } finally { f.cleanup(); }
});

test('require_contract permits only paths owned by a committed approved contract', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, contracts: path.join(s.work, '.aidlc/artifacts/contracts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true } };
    assert.equal(writeBlocked('src/app/text.py', cfg), null);
    assert.match(writeBlocked('src/app/handlers.py', cfg), /outside every approved contract/);
    assert.equal(writeBlocked('.aidlc/artifacts/intent-refs/change.json', cfg), null);
  } finally { s.cleanup(); }
});

// lean-v2 B6. `[guard].protected_paths` and `require_contract` were two answers to one question,
// and they disagreed: `dormant-sensors-run-at-commit` named `evals/fixtures/_base/.aidlc/harness.toml`
// in its sealed plan, the protected-path rule refused the write anyway, and the suite stayed red
// until a human typed the line by hand. A protected path is protected from an *unplanned* write.
// A human sealing a plan that names the exact path is the decision the rule exists to require.
test('a protected path an approved committed contract names is writable', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, contracts: path.join(s.work, '.aidlc/artifacts/contracts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true, protected_paths: ['src/app', 'evals/fixtures'] } };

    // Owned by the fixture's committed approved contract, and protected. The plan wins.
    assert.equal(writeBlocked('src/app/text.py', cfg), null, 'refused a path the approved plan owns');

    // Protected and owned by nothing: still refused, and the message says what would unblock it.
    assert.match(String(writeBlocked('evals/fixtures/_base/x.toml', cfg)), /protected_paths/);

    // Unowned and protected is refused by the protected-path rule, which is the narrower message.
    assert.match(String(writeBlocked('src/app/handlers.py', cfg)), /protected_paths/);

    // With nothing protected, the same path is refused by the ownership rule instead. Both rules
    // still refuse it; ownership is what either of them yields to.
    const unprotected = { layout, guard: { require_contract: true } };
    assert.match(String(writeBlocked('src/app/handlers.py', unprotected)), /outside every approved contract/);
    assert.equal(writeBlocked('src/app/text.py', unprotected), null);
  } finally { s.cleanup(); }
});

test('a malformed contract fails closed for product writes', () => {
  const f = tmp('guard-bad-'); try {
    f.layout.contracts = path.join(f.root, '.aidlc/artifacts/contracts'); mkdirSync(f.layout.contracts, { recursive: true });
    writeFileSync(path.join(f.layout.contracts, 'change.md'), '# malformed contract\n');
    assert.match(writeBlocked('src/app.py', { layout: f.layout, guard: { require_contract: true } }), /approved delivery contract/);
  } finally { f.cleanup(); }
});

test('a release to a live environment without an approval identifier is denied', () => {
  assert.match(productionDenied('deploy --env production', {}), /needs an authorization/);
  assert.equal(productionDenied('deploy --env production', { HARNESS_RELEASE_APPROVAL: 'CAB-1' }), null);
  assert.equal(productionDenied('make test', {}), null);
  assert.match(productionDenied('kubectl apply -f prod/app.yaml', {}), /needs an authorization/);
  assert.match(productionDenied('cd infra && helm upgrade prod ./chart', {}), /needs an authorization/);
});

// lean-v2 B9. The rule fired four times in one session against commands that only named it: a
// script whose heredoc quoted a test assertion, a commit message describing the subsystem being
// removed, a note recording those two, and the edit adding rule ids to the destructive list.
// None was a release. A guard people learn to route around protects nothing, and until the
// ledger carried a rule id nothing could tell these apart from a real catch.
test('naming a rule is not invoking it', () => {
  const heredoc = "cat > note.md <<'EOF'\nwe removed the deploy port and its production rollback\nEOF";
  assert.equal(productionDenied(heredoc, {}), null, 'refused a heredoc body that only described a release');
  assert.equal(productionDenied('git commit -m "delete the deploy port and production receipts"', {}), null);

  // And an invocation in either shape is still refused.
  assert.ok(productionDenied('terraform apply -var env=production', {}));
  assert.ok(productionDenied('echo start; deploy --target production', {}));

  // Heredoc bodies are not write destinations either: the file after `>` is, and nothing inside.
  assert.deepEqual(writeTargets("cat > real.txt <<'EOF'\nnot > a-target.txt\nEOF"), ['real.txt']);
});

test('lock tests writes a lock the write guard honors, and clear removes it', () => {
  const f = tmp('guard-lock-'); try {
    const cfg = { layout: f.layout, guard: {} };
    lockTests(cfg, { patterns: ['tests/test_calc.py'], why: 'bug fix in progress' });
    assert.match(writeBlocked('tests/test_calc.py', cfg), /test-locked/);
    assert.equal(writeBlocked('src/calc.py', cfg), null);
    clearLock(cfg);
    assert.equal(existsSync(path.join(f.layout.state, 'test-lock.json')), false);
    assert.equal(writeBlocked('tests/test_calc.py', cfg), null);
  } finally { f.cleanup(); }
});

