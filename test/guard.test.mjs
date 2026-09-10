import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { C, BIN } from './_paths.mjs';
import { writeBlocked, productionDenied, lockTests, clearLock, bashTouchesProtected, bashContractBlocked, writeTargets } from '../.aidlc/lib/guard.mjs';
import { render, bodyDigest, selectChange } from '../.aidlc/lib/artifacts.mjs';
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

// A simulated approved spec and approved/draft plan, committed and explicitly selected.
function approvedChange(root, slug, files, specAt, { plan = 'approved' } = {}) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
  const seal = (body, at) => {
    const draft = render({ status: 'draft' }, body);
    return render({ status: 'approved', by: 'tester', at, digest: bodyDigest(draft) }, body);
  };
  writeFileSync(path.join(dir, 'spec.md'), seal(`# Spec: ${slug}\n\n### B1\n\nGiven, when, then.\n`, specAt));
  const planBody = `# Plan: ${slug}\n\n## Files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
  writeFileSync(path.join(dir, 'plan.md'), plan === 'approved' ? seal(planBody, specAt) : render({ status: 'draft' }, planBody));
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', `${slug} written`], { cwd: root });
  selectChange({ layout: { root, artifacts: path.join(root, '.aidlc/artifacts') } }, slug);
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
      assert.match(String(writeBlocked(rel, cfg)), /agent instructions or permissions/, `stopped guarding ${rel}`);
    }
  } finally { f.cleanup(); }
});

// force-is-not-the-agents-to-give B1/B2. `init` refuses to rewrite a cached-prefix file and says
// to make the change between sessions; `--force` is the human's way past that. On 2026-09-02 the
// agent read the refusal, named the cache miss it would cause, and forced anyway. The pre-bash
// hook sees only commands the agent issues, so denying there leaves a human's own shell alone.
test('the agent cannot force init past the prefix guard, in any spelling', async () => {
  const { dispatch } = await import('../.aidlc/hooks/dispatch.mjs');

  // A temp repo, not this one. Dispatching against the real root wrote every rehearsal into the
  // real ledger: `init-force` reached 120 recorded fires, none of them a person being stopped
  // from anything, and it was the busiest rule on the audit. A ledger that counts its own tests
  // is the "17.7% fired, keep" guess that B9 exists to end.
  const home = mkdtempSync(path.join(tmpdir(), 'dispatch-'));
  mkdirSync(path.join(home, '.aidlc'), { recursive: true });
  writeFileSync(path.join(home, '.aidlc/harness.toml'), '[project]\nname = "dispatch-test"\n');

  const ask = async (command) => {
    const chunks = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { chunks.push(String(s)); return true; };
    const stdin = process.stdin;
    // dispatch reads the tool call from stdin as JSON.
    const { Readable } = await import('node:stream');
    Object.defineProperty(process, 'stdin', { value: Readable.from([JSON.stringify({ cwd: home, tool_input: { command } })]), configurable: true });
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
    assert.match(out, /agent instructions or permissions/, `allowed: ${cmd}`);
    assert.match(out, /ask the human to run it/i, `no human hand-off named for: ${cmd}`);
  }

  // B2: ordinary init stays available, or the install and upgrade paths close.
  assert.doesNotMatch(await ask('node .aidlc/bin/harness init --into .'), /agent instructions or permissions/);

  // B6: an invocation, not a mention. The first version matched the string anywhere and refused
  // the script writing this contract's own evidence, which quoted the rule it was documenting.
  for (const cmd of [
    `node -e "console.log('the rule refuses ${'harness init'} ${'--force'} from the agent')"`,
    `printf '%s' 'documented: ${'harness init'} ${'--force'} is the human route'`,
  ]) {
    assert.doesNotMatch(await ask(cmd), /agent instructions or permissions/, `refused a mention, not an invocation: ${cmd}`);
  }

  rmSync(home, { recursive: true, force: true });
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
    layout: { ...f.layout, artifacts: path.join(f.root, '.aidlc/artifacts') },
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
    const layout = { root: s.work, artifacts: path.join(s.work, '.aidlc/artifacts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true } };
    assert.equal(writeBlocked('src/app/text.py', cfg), null);
    assert.match(writeBlocked('src/app/handlers.py', cfg), /outside the current change "hyphen-titlecase"/);
    assert.equal(writeBlocked('.aidlc/artifacts/intent-refs/change.json', cfg), null);
  } finally { s.cleanup(); }
});

// a-diff-belongs-to-one-change B2. F10, second instance: a generator edited a file under a
// change that finished two days earlier, because that change's plan owned the directory. A
// path named only by another change's plan is refused, and the refusal names the change that
// is actually being made.
test('a path named only by an older change\'s plan is refused under the current change', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, artifacts: path.join(s.work, '.aidlc/artifacts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true } };
    approvedChange(s.work, 'second-change', ['src/app/second.py'], '2026-09-02T00:00:00.000Z');

    assert.equal(writeBlocked('src/app/second.py', cfg), null, 'refused a path the current plan owns');
    const refusal = String(writeBlocked('src/app/text.py', cfg));
    assert.match(refusal, /outside the current change "second-change"/);
    assert.doesNotMatch(refusal, /require_contract = false/);
  } finally { s.cleanup(); }
});

// B3. F26: sprint 3's plan was refused at the gate and the sprint wrote product code anyway on
// sprint 2's authority. A current change without an approved plan refuses every product write,
// and says what to do next — never that the guard can be switched off (F2).
test('a current change with no approved plan refuses every product write and names the way forward', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, artifacts: path.join(s.work, '.aidlc/artifacts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true } };
    approvedChange(s.work, 'sprint-3', ['src/app/text.py'], '2026-09-02T00:00:00.000Z', { plan: 'draft' });

    for (const rel of ['src/app/text.py', 'src/app/handlers.py']) {
      const refusal = String(writeBlocked(rel, cfg));
      assert.match(refusal, /sprint-3/);
      assert.match(refusal, /plan not approved/);
      assert.match(refusal, /harness approve sprint-3 plan/);
      assert.match(refusal, /close/);
      assert.doesNotMatch(refusal, /require_contract = false/);
    }
    // Artifacts stay writable: the gate you cannot draft is not a gate.
    assert.equal(writeBlocked('.aidlc/artifacts/sprint-3/plan.md', cfg), null);
  } finally { s.cleanup(); }
});

// lean-v2 B6. `[guard].protected_paths` and `require_contract` were two answers to one question,
// and they disagreed: `dormant-sensors-run-at-commit` named `evals/fixtures/_base/.aidlc/harness.toml`
// in its sealed plan, the protected-path rule refused the write anyway, and the suite stayed red
// until a human typed the line by hand. A protected path is protected from an *unplanned* write.
// A human sealing a plan that names the exact path is the decision the rule exists to require.
test('a protected path an approved committed contract names is writable', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, artifacts: path.join(s.work, '.aidlc/artifacts'), state: path.join(s.work, '.aidlc/state') };
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
    assert.match(String(writeBlocked('src/app/handlers.py', unprotected)), /outside the current change/);
    assert.equal(writeBlocked('src/app/text.py', unprotected), null);
  } finally { s.cleanup(); }
});

// D1 (a-shell-redirect-is-a-write) B1. bashContractBlocked used to ask only "is *any* change
// approved?" instead of "is *this* target approved?": any selected change with a non-empty
// ## Files made every path in the repository writable through a shell redirect, because the
// extracted target was discarded rather than tested. This table asserts the bash path and the
// Write/Edit path answer the same question about the same target, across every class B1 names:
// owned, unowned, a protected path, an artifact path, and a /dev/ target. `norm` reproduces the
// same repository-relative computation `preWrite` in dispatch.mjs applies before calling
// writeBlocked, so the two sides are handed the same string rather than two different ones.
test('the bash path and the write path return one verdict for one target', async () => {
  const { loadConfig } = await import('../.aidlc/lib/config.mjs');
  const s = stage(FIXTURES, 'contract-planned'); try {
    const cfg = loadConfig(s.work);
    const norm = (t) => path.relative(cfg.layout.root, path.resolve(cfg.layout.root, t));
    const rows = [
      ['owned', 'src/app/text.py'],
      ['unowned', 'src/app/handlers.py'],
      ['protected', '.aidlc/harness.toml'],
      ['artifact', '.aidlc/artifacts/hyphen-titlecase/plan.md'],
      ['/dev/', '/dev/null'],
    ];
    for (const [label, target] of rows) {
      const write = writeBlocked(norm(target), cfg);
      const bash = bashContractBlocked(`echo x > ${target}`, cfg);
      assert.equal(Boolean(bash), Boolean(write),
        `${label} target "${target}" disagreed — bash=${JSON.stringify(bash)} write=${JSON.stringify(write)}`);
    }
  } finally { s.cleanup(); }
});

// B4. A path outside the repository — an absolute path under a temporary directory, or one that
// resolves above the repository root — is outside what any ## Files section can describe, so it
// is allowed on both paths. This is a relaxation of the old bash behaviour (refused when nothing
// was approved) to match what the Write path already did, and the two paths compute the
// repository-relative path the same way, so they cannot disagree about which side of the root a
// target falls on.
test('an out-of-tree target is allowed on both paths', async () => {
  const { loadConfig } = await import('../.aidlc/lib/config.mjs');
  const s = stage(FIXTURES, 'contract-planned'); try {
    const cfg = loadConfig(s.work);
    const outside = path.join(tmpdir(), 'harness-probe.txt');

    assert.equal(bashContractBlocked(`echo x > ${outside}`, cfg), null, 'refused an absolute out-of-tree target');
    assert.equal(writeBlocked(path.relative(cfg.layout.root, outside), cfg), null, 'the write path refused it too');

    assert.equal(bashContractBlocked('echo x > ../outside.txt', cfg), null, 'refused a ../ escape');
    assert.equal(writeBlocked('../outside.txt', cfg), null);
  } finally { s.cleanup(); }
});

// B1's last clause: several write targets are refused if any one of them would be, and the
// refusal names that target rather than the first one extracted. The command below writes the
// owned path first and the unowned path second, so a refusal naming the first target would prove
// nothing changed — this proves the verdict is per target, not per command.
test('a command with several write targets is refused for the unowned one, not the first extracted', async () => {
  const { loadConfig } = await import('../.aidlc/lib/config.mjs');
  const s = stage(FIXTURES, 'contract-planned'); try {
    const cfg = loadConfig(s.work);
    const refusal = String(bashContractBlocked('cat src/app/text.py > src/app/text.py; echo x > src/app/handlers.py', cfg));
    assert.match(refusal, /^src\/app\/handlers\.py /, `refusal did not name the unowned target: ${refusal}`);
  } finally { s.cleanup(); }
});

// B2. The suite only proved the bash guard refuses a product write when nothing is approved —
// precisely the blind spot that let D1 live. A selected change's approved plan makes its own
// paths writable through the shell, exactly as it does through Write and Edit.
test('a shell redirect to a path the approved plan owns proceeds', async () => {
  const { loadConfig } = await import('../.aidlc/lib/config.mjs');
  const s = stage(FIXTURES, 'contract-planned'); try {
    const cfg = loadConfig(s.work);
    assert.equal(bashContractBlocked('echo x > src/app/text.py', cfg), null);
  } finally { s.cleanup(); }
});

// B5. A bash refusal names the rule that actually produced it, so `harness ledger audit` can
// tell a caught mistake from a false block — a single `contract-scope` label across four
// different rules could not answer that question. Drives the real `dispatch('pre-bash')` hook,
// the same harness the two tests above at lines 106 and 443 use, and reads the appended row.
test('a bash refusal names the rule that produced it, in the ledger', async () => {
  const { dispatch } = await import('../.aidlc/hooks/dispatch.mjs');
  const { read } = await import('../.aidlc/lib/ledger.mjs');
  const home = mkdtempSync(path.join(tmpdir(), 'dispatch-rule-'));
  mkdirSync(path.join(home, '.aidlc'), { recursive: true });
  writeFileSync(path.join(home, '.aidlc/harness.toml'), '[project]\nname = "dispatch-test"\n');

  const ask = async (command) => {
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    const stdin = process.stdin;
    const { Readable } = await import('node:stream');
    Object.defineProperty(process, 'stdin', { value: Readable.from([JSON.stringify({ cwd: home, tool_input: { command } })]), configurable: true });
    try { await dispatch('pre-bash'); } finally {
      process.stdout.write = write;
      Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
    }
  };

  try {
    await ask('echo x > src/app.py');             // unowned: no change is selected in this repo
    await ask('echo x > .aidlc/harness.toml');     // protected by default

    const rows = read({ ledger: path.join(home, '.aidlc/state/ledger.jsonl') })
      .filter((r) => r.control === 'bash-guard' && r.verdict === 'fail');
    assert.equal(rows[0]?.rule, 'write-scope', `expected write-scope, got ${rows[0]?.rule}`);
    assert.equal(rows[1]?.rule, 'protected-path', `expected protected-path, got ${rows[1]?.rule}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a malformed contract fails closed for product writes', () => {
  const f = tmp('guard-bad-'); try {
    f.layout.contracts = path.join(f.root, '.aidlc/artifacts/contracts'); mkdirSync(f.layout.contracts, { recursive: true });
    writeFileSync(path.join(f.layout.contracts, 'change.md'), '# malformed contract\n');
    const refusal = String(writeBlocked('src/app.py', { layout: f.layout, guard: { require_contract: true } }));
    assert.match(refusal, /cannot resolve selection/);
    assert.doesNotMatch(refusal, /require_contract = false/);
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

// lean-v2 B9, continued. Six false blocks of one family in one session, against zero true
// catches: a `>` that is not a redirection. A guard people route around protects nothing.
test('a redirection is a redirection, not every angle bracket', () => {
  // A trailer ending in an address, with the next line read as its destination.
  assert.deepEqual(writeTargets('git commit -m "x\nCo-Authored-By: A <n@example.invalid>\nClaude-Session: https://x"'), []);
  // An arrow function and a comparison.
  assert.deepEqual(writeTargets('node -e "console.log(p.map(x=>x.owns).length)"'), []);
  assert.deepEqual(writeTargets('node -e "if (a >= b) log(1)"'), []);

  // And the writes it exists for still register.
  assert.deepEqual(writeTargets('echo hi > out.txt'), ['out.txt']);
  assert.deepEqual(writeTargets('echo hi >> out.txt'), ['out.txt']);
  assert.deepEqual(writeTargets('cmd 2>&1 | tail'), []);
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


// a-draft-is-a-declaration B1 and B5. F30: a real spec, unapproved, beside an open approved
// change whose plan owns the file. The write is refused naming the draft and gate 1, never the
// switch; only its own gates or explicit reselection can restore execution.
test('a selected draft refuses writes until its gates pass or another change is explicitly selected', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, artifacts: path.join(s.work, '.aidlc/artifacts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true } };
    assert.equal(writeBlocked('src/app/text.py', cfg), null);

    const dir = path.join(s.work, '.aidlc/artifacts/paid-never-overdue');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
    const body = '# Spec: paid-never-overdue\n\n### B1\n\nGiven a paid invoice\nWhen isOverdue is asked\nThen it answers false\n';
    writeFileSync(path.join(dir, 'spec.md'), render({ status: 'draft' }, body));

    assert.equal(writeBlocked('src/app/text.py', cfg), null, 'unselected draft cannot block');
    selectChange(cfg, 'paid-never-overdue');
    const refusal = String(writeBlocked('src/app/text.py', cfg));
    assert.match(refusal, /"paid-never-overdue"/);
    assert.match(refusal, /awaits gate 1/);
    assert.match(refusal, /harness approve paid-never-overdue spec/);
    assert.match(refusal, /close/);
    assert.doesNotMatch(refusal, /require_contract = false/);
    assert.equal(writeBlocked('.aidlc/artifacts/paid-never-overdue/spec.md', cfg), null, 'the draft itself stays writable');

    // Closing never borrows another plan; explicitly select the previous work.
    writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: closed\n---\n# Intent\n');
    assert.match(writeBlocked('src/app/text.py', cfg), /closed/);
    selectChange(cfg, 'hyphen-titlecase');
    assert.equal(writeBlocked('src/app/text.py', cfg), null);

    // Reopen and approve instead: the draft becomes current, and its (absent) plan governs nothing.
    writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
    const draft = render({ status: 'draft' }, body);
    writeFileSync(path.join(dir, 'spec.md'), render({ status: 'approved', by: 'tester', at: '2026-09-03T00:00:00.000Z', digest: bodyDigest(draft) }, body));
    selectChange(cfg, 'paid-never-overdue');
    assert.match(String(writeBlocked('src/app/text.py', cfg)), /approval is not committed/);
    spawnSync('git', ['add', '-A'], { cwd: s.work });
    spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'simulated spec approval'], { cwd: s.work });
    assert.match(String(writeBlocked('src/app/text.py', cfg)), /paid-never-overdue — plan not approved/);
  } finally { s.cleanup(); }
});

// an-edited-approval-awaits-its-gate B1. F32: editing sprint 2's approved spec handed the write
// to sprint 1's plan. The refusal names the change and the artifact, both remedies, and where a
// reversal belongs — never the switch.
test('an edited approved spec refuses every product write until re-approved or restored', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, artifacts: path.join(s.work, '.aidlc/artifacts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true } };
    approvedChange(s.work, 'sprint-2', ['src/app/text.py'], '2026-09-02T00:00:00.000Z');
    assert.equal(writeBlocked('src/app/text.py', cfg), null);

    const spec = path.join(s.work, '.aidlc/artifacts/sprint-2/spec.md');
    writeFileSync(spec, readFileSync(spec, 'utf8') + '\n### B8\n\nGiven a paid invoice\nWhen asked\nThen never overdue\n');
    const refusal = String(writeBlocked('src/app/text.py', cfg));
    assert.match(refusal, /sprint-2\/spec\.md was edited after it was approved/);
    assert.match(refusal, /harness approve sprint-2 spec/);
    assert.match(refusal, /restore the approved text/);
    assert.match(refusal, /supersedes:/);
    assert.doesNotMatch(refusal, /require_contract = false/);
    assert.equal(writeBlocked('.aidlc/artifacts/sprint-2/spec.md', cfg), null, 'the artifact stays writable');
  } finally { s.cleanup(); }
});

// close-the-harness B1, B2. the-suite-measures-this-harness F37: refused at a file outside its
// plan, an agent created a change, approved its own spec and plan with `--by`, and made the
// edit. Every gate is a tool call away unless the one command that opens them is the human's.
// The pre-bash hook sees only the agent's commands, so a human's shell is untouched — the same
// mechanism `init --force` uses. Under the unattended runner the agent is its own approver on
// purpose, and the rule stands down.
test('an agent cannot run harness approve in an attended session; a mention is not an invocation; unattended may', async () => {
  const { dispatch } = await import('../.aidlc/hooks/dispatch.mjs');
  const home = mkdtempSync(path.join(tmpdir(), 'dispatch-approve-'));
  mkdirSync(path.join(home, '.aidlc'), { recursive: true });
  writeFileSync(path.join(home, '.aidlc/harness.toml'), '[project]\nname = "dispatch-test"\n');
  const ask = async (command) => {
    const chunks = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { chunks.push(String(s)); return true; };
    const stdin = process.stdin;
    const { Readable } = await import('node:stream');
    Object.defineProperty(process, 'stdin', { value: Readable.from([JSON.stringify({ cwd: home, tool_input: { command } })]), configurable: true });
    try { await dispatch('pre-bash'); } finally {
      process.stdout.write = write;
      Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
    }
    return chunks.join('');
  };
  const had = process.env.AIDLC_UNATTENDED;
  delete process.env.AIDLC_UNATTENDED;
  try {
    for (const cmd of [
      'node .aidlc/bin/harness approve my-change spec --by me',
      'bash .aidlc/bin/harness approve my-change plan --by tester',
      'cd /tmp && .aidlc/bin/harness approve x spec --by y',
    ]) {
      const out = await ask(cmd);
      assert.match(out, /approval is the human/i, `allowed: ${cmd}`);
      assert.match(out, /ask the human/i, `no hand-off named for: ${cmd}`);
    }
    for (const cmd of [
      'git commit -m "the owner ran harness approve for this spec"',
      "cat > notes.md <<'EOF'\nrun harness approve x spec\nEOF",
      'node .aidlc/bin/harness status',
    ]) {
      const out = await ask(cmd);
      assert.doesNotMatch(out, /approval is the human/i, `refused a mention or an unrelated command: ${cmd}`);
    }
    process.env.AIDLC_UNATTENDED = '1';
    const unattended = await ask('node .aidlc/bin/harness approve my-change spec');
    assert.match(unattended, /approval is the human/i, 'trial flags do not grant approval authority');
  } finally {
    if (had === undefined) delete process.env.AIDLC_UNATTENDED; else process.env.AIDLC_UNATTENDED = had;
    rmSync(home, { recursive: true, force: true });
  }
});

// B3. F38: an agent edited `.aidlc/harness.toml` in a task about a health endpoint. The registry
// is protected by default in every installed repository; a plan that names it still may.
test('the registry is a protected path by default, and a plan naming it still permits the write', async () => {
  const { loadConfig } = await import('../.aidlc/lib/config.mjs');
  const s = stage(FIXTURES, 'contract-planned'); try {
    const cfg = loadConfig(s.work);
    assert.ok(cfg.guard.protected_paths.includes('.aidlc/harness.toml'), 'protected by default');
    assert.match(String(writeBlocked('.aidlc/harness.toml', cfg)), /protected_paths/);
    approvedChange(s.work, 'tune-registry', ['.aidlc/harness.toml'], '2026-09-02T00:00:00.000Z');
    assert.equal(writeBlocked('.aidlc/harness.toml', loadConfig(s.work)), null, 'a plan naming it wins');
  } finally { s.cleanup(); }
});
