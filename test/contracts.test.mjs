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
  assert.ok(gated >= 5, `expected at least five gated workflows, found ${gated}`);
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

test('Claude PR review is read-only and cannot declare the human gate approved', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/claude-review.yml'), 'utf8');
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.match(workflow, /--disallowedTools [^\n]*Write,Edit/);
  const adapter = readFileSync(path.join(A, 'lib/review-adapter.mjs'), 'utf8');
  assert.match(adapter, /Status:\*\* draft/);
  assert.match(adapter, /human reviewer owns Gate 3/);
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

test('legacy handoff automation is absent and monitor writes through a PR without a model', () => {
  assert.equal(existsSync(path.join(ROOT, '.github/workflows/harness-handoff.yml')), false);
  assert.equal(existsSync(path.join(ROOT, '.github/workflows/harness-design.yml')), false);
  assert.equal(existsSync(path.join(A, 'lib/handoff.mjs')), false);
  assert.equal(existsSync(path.join(A, 'templates/spec.md')), false);
  assert.equal(existsSync(path.join(A, 'templates/plan.md')), false);
  const monitor = readFileSync(path.join(ROOT, '.github/workflows/harness-monitor.yml'), 'utf8');
  assert.match(monitor, /schedule:/);
  assert.match(monitor, /harness monitor detect/);
  assert.match(monitor, /gh pr create/);
  assert.match(monitor, /actions:\s*read/);
  assert.doesNotMatch(monitor, /claude -p/);
  assert.doesNotMatch(monitor, /ANTHROPIC_API_KEY/);
  assert.doesNotMatch(monitor, /deploy rollback production/);
});
