// The static half of the writer/grader separation. v6 proved that the runtime half alone is
// not enough: a contract nobody validates drifts away from the frontmatter it describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { A, C, ROOT } from './_paths.mjs';


function frontmatter(file) {
  const m = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, `${file} has no frontmatter`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// Every harness.toml in the tree, discovered rather than listed. Two tests ask questions of this
// set and neither may answer for a file someone forgot to add.
function discoverConfigs() {
  const configs = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'harness.toml') configs.push(p);
    }
  };
  walk(ROOT);
  assert.ok(configs.length >= 5, `expected to discover several harness.toml, found ${configs.length}`);
  return configs;
}

test('every agent has a contract, and its tools match its frontmatter', () => {
  const dir = path.join(A, 'roles');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const name = f.replace(/\.md$/, '');
    const contractPath = path.join(dir, `${name}.contract.json`);
    assert.ok(existsSync(contractPath), `${name} has no contract`);
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    const fm = frontmatter(path.join(dir, f));
    const declared = (fm.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    assert.deepEqual(declared, contract.tools, `${name}: frontmatter tools drifted from the contract`);
    assert.ok(contract.why, `${name}: a contract without a why: is not a control (Law 10)`);
    if (contract.may_write === false) {
      assert.ok(!declared.includes('Write') && !declared.includes('Edit'),
        `${name} declares may_write:false but is granted a write tool`);
    }
  }
});

test('every skill has a name and a pushy third-person description', () => {
  const dir = path.join(A, 'skills');
  for (const s of readdirSync(dir)) {
    const fm = frontmatter(path.join(dir, s, 'SKILL.md'));
    assert.equal(fm.name, s, `${s}: frontmatter name must equal the directory name`);
    assert.ok(fm.description.length > 80, `${s}: description too thin to trigger reliably`);
    assert.ok(fm.description.length <= 1024, `${s}: description over the 1024-char limit`);
    assert.match(fm.description, /should be used|Use when|used when/i,
      `${s}: description must say WHEN to use it — that is what makes it fire`);
  }
});

test('skills stay short: 130 lines hard stop', () => {
  const dir = path.join(A, 'skills');
  for (const s of readdirSync(dir)) {
    const n = readFileSync(path.join(dir, s, 'SKILL.md'), 'utf8').split('\n').length;
    assert.ok(n <= 130, `${s}/SKILL.md is ${n} lines. Split it into references/ or cut it.`);
  }
});

test('no skill sequences phases (Law 2)', () => {
  // A numbered list longer than eight steps inside a skill is a program written in English.
  const dir = path.join(A, 'skills');
  for (const s of readdirSync(dir)) {
    const text = readFileSync(path.join(dir, s, 'SKILL.md'), 'utf8');
    const longest = Math.max(0, ...text.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => /^\s*\d+\.\s/.test(l)).length));
    assert.ok(longest <= 8, `${s}: a ${longest}-step numbered sequence belongs in bin/harness, not a skill`);
  }
});

// no-name-points-at-nothing B1-B4. A stage entry naming a control with no implementation is a
// check that silently never runs, which reads exactly like a check that passed. `plan-drift` had
// no implementation since 303b58b and survived in evals/fixtures/_base — where it left contract
// scope enforcement with no eval coverage and made contract-scope-honesty unfalsifiable — and
// then in both examples, which are the two files a newcomer copies from.
//
// Configs are discovered, not listed: a test that only checks the files someone remembered to
// list is the same class of thing as the defect it catches.
test('every stage entry in every harness.toml resolves to something that runs', async () => {
  const { LOCAL_CHECKS } = await import('../.aidlc/lib/runner.mjs');
  const { VERBS } = await import('../.aidlc/lib/config.mjs');
  const { parseToml } = await import('../.aidlc/lib/toml.mjs');

  const configs = discoverConfigs();

  const resolvable = new Set([...Object.keys(LOCAL_CHECKS), ...VERBS]);
  const dangling = [];
  for (const file of configs) {
    const stages = parseToml(readFileSync(file, 'utf8')).stages ?? {};
    for (const [stage, entries] of Object.entries(stages)) {
      for (const entry of entries ?? []) {
        if (stages[entry] || resolvable.has(entry)) continue;
        dangling.push(`${path.relative(ROOT, file)} [${stage}] names "${entry}", which is neither a stage, a local check, nor a capability verb`);
      }
    }
  }
  assert.deepEqual(dangling, [], `\n  ${dangling.join('\n  ')}`);
});

// dormant-sensors-run-at-commit B1. The mirror of the test above: that one asks whether every
// name a stage uses resolves to something real, this one asks whether everything that must run is
// named by a stage at all. `arch` and `test_quality` were declared, required by
// `[sensors] required_profiles`, and reachable from no stage — so `harness check` never invoked
// them and the ledger, unable to tell silence from health, filed them beside a control that had
// run 78 times. A sensor nobody runs is enforced only at release, which is the last place a
// structural rule is any use.
//
// B3: reachability is asked through `wiredControls`, the same function `ledger audit` uses. A
// second stage walk here would be one more pair of components answering one question two ways.
test('every command a required sensor profile depends on is reachable from a stage', async () => {
  const { wiredControls } = await import('../.aidlc/lib/ledger.mjs');
  const { parseToml } = await import('../.aidlc/lib/toml.mjs');

  const dormant = [];
  for (const file of discoverConfigs()) {
    const cfg = parseToml(readFileSync(file, 'utf8'));
    const sensors = cfg.sensors ?? {};
    const staged = wiredControls(cfg);
    for (const profile of sensors.required_profiles ?? []) {
      for (const command of sensors[profile] ?? []) {
        if (staged.has(command)) continue;
        dormant.push(`${path.relative(ROOT, file)} [sensors] ${profile} requires "${command}", which no stage runs`);
      }
    }
  }
  assert.deepEqual(dormant, [], `\n  ${dormant.join('\n  ')}`);
});

// B4. Making every name resolve must not flatten two examples into one — they demonstrate
// different languages, and that difference is why there are two.
test('the examples still differ from each other', () => {
  const stages = (p) => readFileSync(path.join(ROOT, p, '.aidlc/harness.toml'), 'utf8')
    .split('\n').find((l) => l.trim().startsWith('fast'));
  assert.notEqual(stages('examples/scratch-py'), stages('examples/scratch-ts'),
    'two examples that run identical stages are one example');
});

// ci-is-green-without-a-key B2/B4/B7. Every push turned the Actions tab red because six
// workflows passed an ANTHROPIC_API_KEY this repository does not have, and none was gated. A
// result that has never carried information is one nobody reads. This is the part that keeps the
// guarantee true: the next workflow someone adds cannot re-open the hole quietly.
test('every model-invoking workflow job is gated behind the one switch', () => {
  const SWITCH = "vars.HARNESS_MODEL_JOBS == 'enabled'";
  const dir = path.join(ROOT, '.github/workflows');
  // harness-intent's draft job is deliberately ungated: its model step carries its own secrets
  // guard with a key-free fallback, and the deterministic intake must keep working without a key.
  const INTENT = 'harness-intent.yml';
  const offenders = [];
  let gated = 0;

  for (const name of readdirSync(dir).filter((f) => f.endsWith('.yml'))) {
    const body = readFileSync(path.join(dir, name), 'utf8');
    if (!/claude-code-action|ANTHROPIC_API_KEY/.test(body)) continue;

    if (name === INTENT) {
      // B7: the job runs, and only the model step is conditional on a key being present.
      assert.doesNotMatch(body, new RegExp(SWITCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name}: the deterministic intake must not be gated off`);
      assert.match(body, /if: \$\{\{ secrets\.ANTHROPIC_API_KEY != '' \}\}/, `${name}: the model step must guard itself`);
      assert.match(body, /if: \$\{\{ secrets\.ANTHROPIC_API_KEY == '' \}\}/, `${name}: and there must be a key-free path`);
      continue;
    }
    if (body.includes(SWITCH)) gated++; else offenders.push(name);
  }

  assert.deepEqual(offenders, [], `these jobs can invoke a model with no switch guarding them: ${offenders.join(', ')}`);
  // lean-v2 cuts 2 and 3 removed the diagnose, monitor and rehearse workflows with the
  // subsystems they drove. The floor exists so this test cannot pass by finding nothing at all;
  // the invariant it guards is `offenders`, not the count.
  assert.ok(gated >= 1, `expected at least one gated workflow, found ${gated}`);
});

// B6, restated as a boundary: gating changes WHEN a job runs, never what it may do when it does.
// unit and cost need no key and must keep running, or the repository has no CI rather than quiet
// CI.
test('the jobs that need no key are not gated', () => {
  const body = readFileSync(path.join(ROOT, '.github/workflows/harness.yml'), 'utf8');
  const jobs = body.split(/\n  (?=[a-z_-]+:\n)/);
  const unit = jobs.find((j) => j.trimStart().startsWith('unit:'));
  const cost = jobs.find((j) => j.trimStart().startsWith('cost:'));
  for (const [name, job] of [['unit', unit], ['cost', cost]]) {
    assert.ok(job, `${name} job not found`);
    assert.doesNotMatch(job, /HARNESS_MODEL_JOBS/, `${name} needs no key and must run on every push`);
  }
});

test('CI model evals cover every steering surface and require authentication', () => {
  const workflow = readFileSync(path.join(ROOT, '.github', 'workflows', 'harness.yml'), 'utf8');
  for (const surface of [String.raw`CLAUDE\.md`, String.raw`settings\.json`, String.raw`harness\.toml`, 'skills/', 'roles/', 'hooks/', 'templates/', 'evals/']) {
    assert.ok(workflow.includes(surface), surface);
  }
  assert.match(workflow, /run\.mjs --require-auth/);
});

test('marketplace ships the kernel plugin only; extra policy skills stay out of the budget', () => {
  const market = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  // Read the name rather than hardcode it: this assertion is about there being exactly one
  // plugin, not about what it is called. test/install.test.mjs owns the naming contract.
  const declared = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).name;
  assert.deepEqual(market.plugins.map((p) => p.name), [declared]);
  assert.equal(market.plugins[0].source, './.');
  assert.equal(existsSync(path.join(ROOT, 'plugins')), false);
  assert.equal(existsSync(path.join(A, 'skills', 'secure-api')), false);
  assert.equal(existsSync(path.join(A, 'skills', 'ux-standards')), false);
  assert.equal(existsSync(path.join(A, 'roles', 'policy-reviewer.md')), false);
  assert.equal(existsSync(path.join(A, 'roles', 'simplifier.md')), false);
});

test('legacy handoff automation is absent', () => {
  assert.equal(existsSync(path.join(ROOT, '.github/workflows/harness-handoff.yml')), false);
  assert.equal(existsSync(path.join(ROOT, '.github/workflows/harness-design.yml')), false);
  assert.equal(existsSync(path.join(A, 'lib/handoff.mjs')), false);
  // spec.md and plan.md are templates again — lean-v2 B4 made them two of the three artifacts a
  // change produces. What must stay absent is the automation that once wrote them unasked.
  assert.equal(existsSync(path.join(A, 'lib/contract.mjs')), false);
  // The monitor half of this test went with lean-v2 cut 3: the workflow, the scheduled detect,
  // and the pull request it opened are gone along with operations.mjs and incidents.mjs. The
  // Maintain loop is an example script now, and returns as code when a service produces a defect.
});

// lean-v2 B1. Every kernel module is reachable from something that runs it.
//
// The audit that opened lean-v2 found roughly 2,700 kernel lines that no stage, hook or CLI verb
// reached: a work-item port, a release port, a monitoring loop, four agent adapters, a model-role
// tree, a second sensor runner, playbook indicators. The ledger could not see any of it, because
// the ledger can only count what runs — so the mechanism meant to stop the harness growing was
// blind to exactly the growth that happened. This is the test that makes that impossible to
// repeat quietly: a module nobody imports is named, in CI, on the commit that adds it.
test('every kernel module is reachable from an entrypoint', () => {
  const entrypoints = [path.join(A, 'bin/harness'), path.join(A, 'hooks/dispatch.mjs')];
  const dirs = ['lib', 'checks', 'sensors'].map((d) => path.join(A, d));

  const all = new Set();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) if (name.endsWith('.mjs')) all.add(path.join(dir, name));
  }

  // Sensors are named by `[stages]` and run as commands, not imported. Reaching them means being
  // named by a stage, which `test/contracts.test.mjs` already proves resolves to something real.
  const staged = new Set();
  const cfg = readFileSync(path.join(A, 'harness.toml'), 'utf8');
  for (const [, body] of cfg.matchAll(/^\s*\w+\s*=\s*\[([^\]]*)\]/gm)) {
    for (const [, name] of body.matchAll(/"([^"]+)"/g)) staged.add(name);
  }

  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const body = readFileSync(file, 'utf8');
    for (const [, spec] of body.matchAll(/(?:from\s+|import\s*\()['"](\.[^'"]+)['"]/g)) {
      visit(path.resolve(path.dirname(file), spec));
    }
  };
  for (const entry of entrypoints) visit(entry);

  const unreachable = [...all]
    .filter((file) => !seen.has(file))
    // A sensor is reached by being named in a stage, not by being imported.
    .filter((file) => !staged.has(path.basename(file, '.mjs').replace(/-/g, '_')) && !staged.has(path.basename(file, '.mjs')))
    .map((file) => path.relative(ROOT, file));

  assert.deepEqual(unreachable, [], `\n  no entrypoint, hook or stage reaches:\n  ${unreachable.join('\n  ')}`);
});

// lean-v2 B3. One budget, in one place.
//
// The skill ceiling was stated as 12 in the README and the constitution, 11 in the build plan,
// 10 in CLAUDE.md and the registry, and 6 in the company plan. Law 3 says that if two files can
// disagree about the same fact, delete one; four could, and did, for ten days. The registry is
// the fact. Prose may describe the budget and must not restate its numbers.
test('no document states a budget number of its own', () => {
  const toml = readFileSync(path.join(A, 'harness.toml'), 'utf8');
  const limits = Object.fromEntries([...toml.matchAll(/^(skills|agents|hooks)\s*=\s*(\d+)/gm)].map((m) => [m[1], Number(m[2])]));
  assert.ok(limits.skills > 0, 'the registry must state the ceiling');

  const docs = [path.join(ROOT, 'README.md'), path.join(A, 'instructions.md'), path.join(ROOT, '.claude/CLAUDE.md')]
    .concat(readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => path.join(ROOT, 'docs', f)));

  // A line stating what THIS harness allows or ships. A line recounting what v6 had — the
  // comparison table in the build plan — is history, and history does not have to match a limit.
  const claims = /\b(budget|limit|ceiling|supplies|ships|fixed at|inherits|full|allow)/i;

  const wrong = [];
  for (const file of docs) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!claims.test(line)) continue;
      for (const [, count, surface] of line.matchAll(/(\d+)\s+(skills|agents|hooks?\b)/g)) {
        const key = surface.startsWith('hook') ? 'hooks' : surface;
        if (limits[key] !== undefined && Number(count) !== limits[key]) {
          wrong.push(`${path.relative(ROOT, file)}: "${line.trim()}" — [limits] says ${key} = ${limits[key]}`);
        }
      }
    }
  }
  assert.deepEqual(wrong, [], `\n  ${wrong.join('\n  ')}`);
});

// lean-v2 B7. The generator/evaluator split, checked structurally rather than trusted.
//
// It used to be 330 lines of policy resolution, handoff receipts and a provider adapter that no
// contract's evidence ever invoked — configuration describing a separation that never happened.
// Frontmatter makes it real: a different model, a context it did not write in, and no tool that
// could make the checks pass. This test is what stops the two ids quietly becoming one.
test('the generator and the evaluator are different models, and only one of them can write', async () => {
  const { parseToml } = await import('../.aidlc/lib/toml.mjs');
  const models = parseToml(readFileSync(path.join(A, 'harness.toml'), 'utf8')).models ?? {};
  assert.ok(models.generator && models.evaluator, '[models] must name a generator and an evaluator');
  assert.notEqual(models.generator, models.evaluator,
    'one model doing both jobs is not a separation of duties, whatever the config says');

  const implement = frontmatter(path.join(A, 'skills/implement/SKILL.md'));
  assert.equal(implement.model, models.generator, 'the implement skill must run on the generator');
  assert.equal(implement.context, 'fork', 'the generator needs its own context, per the Fusion result');

  const evaluator = frontmatter(path.join(A, 'roles/evaluator.md'));
  assert.equal(evaluator.model, models.evaluator, 'the evaluator must run on the evaluator model');
  assert.equal(evaluator.isolation, 'worktree', 'a fresh checkout it did not write to is the independence');
  const tools = evaluator.tools.split(',').map((t) => t.trim());
  assert.ok(tools.includes('Bash'), 'the evaluator must be able to run the checks');
  for (const forbidden of ['Write', 'Edit', 'NotebookEdit']) {
    assert.ok(!tools.includes(forbidden), `the evaluator must not be able to make the checks pass (${forbidden})`);
  }
});
