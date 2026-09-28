# Intent Audit (2026-09-28) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point the harness at the problem it exists for — small, readable, risk-appropriately reviewed changes — then prove on the calculator workload whether it beats native Claude Code, and stop growing until it does.

**Architecture:** Two new signals reuse what already exists: the diff budget lives inside the `scope-drift` check (it already owns "diff versus approved plan"), and risk tiers are one pure module (`lib/risk.mjs`) read by the delivery driver's review phase. The Simplicity pass goes into the existing review policy, which is also fixed so it actually reaches the reviewer. Everything else is deletion: development history out of shipped prompts, and archived records out of the tree.

**Tech Stack:** Node ≥ 24, ES modules, `node:test`, git CLI. Zero dependencies.

**Spec:** The owner's decisions on 2026-09-28 (conversation), recorded in memory `intent-audit-2026-09-28`:

| # | Decision |
|---|---|
| 1 | Add a Simplicity review pass and a diff-size check. |
| 2 | Add blast-radius risk tiers derived from paths. |
| 3 | Gates stay as they are: `spec`/`plan` advisory, `merge` human. **No change.** |
| 4 | Strip harness development history from shipped prompts and templates. |
| 5 | Freeze new controls; measure native vs harness on the calculator, including changed lines. |
| 6 | Scope Deploy/Maintain honestly in the README. |
| 7 | Move `docs/history` and unread curated evidence out of the main tree. |

## Global Constraints

- Zero dependencies. No `node_modules`, no npm packages. Tests are `node:test` under `test/`.
- Do not activate the harness in this repository: never create `.claude/harness/artifacts/`, never run `harness new`, never enable the plugin or project hooks (`.claude/CLAUDE.md`).
- `[limits]` stays unchanged: skills 7, agents 2, hooks 4, hook_loc 600, claude_md_lines 120. No task adds a skill, agent or hook.
- `[gates]` stays `spec = "advisory"`, `plan = "advisory"`, `merge = "human"`.
- Files under `evals/fixtures/` are write-protected: never edit one to make a test pass.
- Every new control carries a `// why:` comment naming the defect it prevents.
- Full suite command: `node --test test/*.test.mjs` (≈80 s, currently 660 pass / 1 skip). It must be green at the end of every task.
- Live model runs cost money: Task 8 runs only after the owner says go, bounded to ≤ 25 minutes and ≤ USD 4.
- Commit after each task on a feature branch (never on `main` directly). Push nothing without the owner's say-so.

## Review Focus

1. **Binary files in a diff** — `git diff --numstat` reports `-\t-` for them; the diff budget must skip them, not crash or count NaN. Test in Task 2.
2. **New untracked files in a local (non-candidate) check** — they are absent from `numstat` but are real added lines. Test in Task 2.
3. **A plan that claims a whole directory** (`src/auth/`) — the risk tier must judge the claim, not only files that happen to have changed yet. Test in Task 3.
4. **An explicitly empty `high_risk = []`** — a project's choice that nothing is high risk must be honoured, not replaced by defaults. Test in Task 3.
5. **A misspelled `[review] low_effort`** — must fail loudly at config load, not be passed to the CLI as an unknown effort mid-run. Test in Task 3.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `.claude/harness/policies/review.md` | Review passes; gains **Simplicity**, loses dev-history section | 1, 4 |
| `.claude/harness/lib/review.mjs` | Review runner; embeds the policy in the prompt; passes `--effort` | 1, 3 |
| `.claude/harness/lib/diff.mjs` | Git diff helpers; gains shared `TEST_FILE` | 2 |
| `.claude/harness/checks/scope-drift.mjs` | Diff vs approved plan; gains `diff-budget` rule | 2 |
| `.claude/harness/lib/risk.mjs` (new) | Path globs → `{ tier, matched }` | 3 |
| `.claude/harness/lib/config.mjs` | `[budget] max_diff_lines`, `[review]` defaults, `stageModel` tier | 2, 3 |
| `.claude/harness/lib/deliver.mjs` | Review phase picks tier; PR body gets `## Risk` | 3 |
| `.claude/harness/bin/harness` | `harness review` passes the effort | 3 |
| `.claude/harness/templates/harness.toml` | Ships `max_diff_lines` and `[review]`; loses G-/Law tags | 2, 3, 4 |
| `.claude/harness/skills/plan/SKILL.md` | Tells the planner about `Diff budget:` | 2 |
| `.claude/harness/templates/project-instructions.md` | Loses the G16 line | 4 |
| `evals/lib/size.mjs` (new) | Changed source/test lines between two revisions | 5 |
| `evals/lib/campaign.mjs`, `evals/lib/driver-campaign.mjs` | Record lines per accepted change | 5 |
| `evals/lib/comparison.mjs` | Sum lines; `size` criterion in the G24 verdict | 5 |
| `README.md` | Gate wording, phase coverage table, freeze status | 6, 8 |
| `docs/history/`, 11 stale `docs/*.md`, unread `evals/evidence/*` | Deleted after tagging | 7 |
| `test/layout.test.mjs` | Drops the `docs/history` exemption and count | 7 |

---

### Task 1: The reviewer receives the review passes, including Simplicity

Today `review()` builds its prompt from `roles/evaluator.md` only. That file says "cite a named pass from `policies/review.md`", but a plan-scoped export never contains that file (see `test/review.test.mjs:174` — the exported tree has no `.claude/harness/policies/`). The passes never reach the reviewer. Fix that, then add the pass.

**Files:**
- Modify: `.claude/harness/lib/review.mjs:190` (the `const policy = …` line)
- Modify: `.claude/harness/policies/review.md` (`## Passes` and `## What Important means here`)
- Test: `test/review.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: the review prompt contains the full text of `policies/review.md`, which Task 4 shortens.

- [ ] **Step 1: Write the failing test** — append to `test/review.test.mjs` (it already has `candidateRepo()` and imports `review`):

```js
test('the reviewer is handed the review passes, Simplicity included, rather than left to find them', () => {
  const s = candidateRepo();
  try {
    let prompt = null;
    const invoke = (args) => {
      prompt = args[args.indexOf('-p') + 1];
      return { status: 0, stdout: JSON.stringify({ result: 'No findings. approve', total_cost_usd: 0.01 }) };
    };
    review({ root: s.work, base: s.base, candidate: s.candidate, model: 'test-evaluator', output: 'passes.md',
      planFiles: ['src/app/text.py'], invoke });
    assert.match(prompt, /^## Passes$/m);
    assert.match(prompt, /^- Simplicity: /m);
  } finally { s.cleanup(); }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test --test-name-pattern "handed the review passes" test/review.test.mjs`
Expected: FAIL — `The input did not match the regular expression /^## Passes$/m`.

- [ ] **Step 3: Embed the policy** — in `.claude/harness/lib/review.mjs` replace

```js
    const policy = readFileSync(new URL('../roles/evaluator.md', import.meta.url), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
```

with

```js
    // The role says "cite a pass from policies/review.md", and a plan-scoped export never contains
    // that file. The passes travel in the prompt, or the reviewer invents its own.
    const role = readFileSync(new URL('../roles/evaluator.md', import.meta.url), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    const passes = readFileSync(new URL('../policies/review.md', import.meta.url), 'utf8');
    const policy = `${role}\n\n${passes}`;
```

- [ ] **Step 4: Add the pass** — in `.claude/harness/policies/review.md` change the `## Passes` section to:

```markdown
## Passes

Run four passes and tag each finding with its pass:

- Bugs: logic errors, broken edge cases, subtle regressions
- Security: injection risks, authentication gaps, PII in logs
- Compliance: the change matches the approved delivery contract, behaviour evidence, and design principles
- Simplicity: new code where an existing module, function or library already does the job; an abstraction with one caller; code no approved behaviour needs; a diff larger than its behaviours explain. Name the existing thing to reuse, or the lines to delete.
```

and append one paragraph to `## What Important means here`:

```markdown
A Simplicity finding is Important only when the change adds a second implementation of something
the codebase already has. Otherwise it is a nit.
```

- [ ] **Step 5: Run the test, then the suite**

Run: `node --test --test-name-pattern "handed the review passes" test/review.test.mjs` → PASS
Run: `node --test test/*.test.mjs` → all pass (660 + 1 new).

- [ ] **Step 6: Commit**

```bash
git add .claude/harness/lib/review.mjs .claude/harness/policies/review.md test/review.test.mjs
git commit -m "review: hand the reviewer its passes, and add a Simplicity pass"
```

---

### Task 2: Diff budget in the scope-drift check

A change whose non-test lines exceed a budget is a `diff-budget` finding at the plan gate: `warn` under the default advisory gate, `fail` under `human`. The approved plan may raise the budget with one line, `Diff budget: <N> lines`, which is how a large change gets declared at gate 2 instead of discovered at review.

**Files:**
- Modify: `.claude/harness/lib/diff.mjs` (add `TEST_FILE`)
- Modify: `.claude/harness/checks/scope-drift.mjs` (imports; new `diffBudget`, `countChangedLines`; end of `run`)
- Modify: `.claude/harness/lib/config.mjs` (`budget:` default in `loadConfig`)
- Modify: `.claude/harness/templates/harness.toml` (`[budget]`)
- Modify: `.claude/harness/skills/plan/SKILL.md` (`## Files` section)
- Test: `test/scope-drift.test.mjs`

**Interfaces:**
- Produces: `export const TEST_FILE: RegExp` in `lib/diff.mjs` (used again by Task 5); `export function diffBudget(cfg, planBody: string): number` in `checks/scope-drift.mjs`; finding rule id `diff-budget`.

- [ ] **Step 1: Write the failing tests** — in `test/scope-drift.test.mjs`, first give the `approvedPlan` helper an `extra` option. Change its signature and body line:

```js
function approvedPlan(root, slug, files, { commitIt = true, at = '2026-09-02T00:00:00.000Z', extra = '' } = {}) {
```

```js
  const body = `# Plan: ${slug}\n\n## Files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n${extra}`;
```

Update the import line to also bring in the new exports:

```js
import { run, diffBudget } from '../.claude/harness/checks/scope-drift.mjs';
import { TEST_FILE } from '../.claude/harness/lib/diff.mjs';
```

Then append:

```js
const lines = (n, tag) => Array.from({ length: n }, (_, i) => `# ${tag} ${i}`).join('\n') + '\n';
const budgetFindings = (result) => result.findings.filter((f) => f.rule === 'diff-budget');

test('test files are recognised by directory and by name', () => {
  for (const f of ['tests/test_app.py', 'test/calc.test.mjs', 'src/__tests__/a.ts', 'src/calc.spec.ts', 'pkg/calc_test.go', 'spec/models/user_spec.rb'])
    assert.ok(TEST_FILE.test(f), f);
  for (const f of ['src/app/text.py', 'src/contest.py', 'src/latest/index.ts'])
    assert.ok(!TEST_FILE.test(f), f);
});

test('non-test lines over the diff budget are a plan-gate finding; test lines are free', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const tight = { ...cfg(s.work), budget: { max_diff_lines: 5 } };
    writeFileSync(path.join(s.work, 'tests/test_app.py'), lines(50, 'test'));
    assert.deepEqual(budgetFindings(await run(tight)), [], 'test lines do not count');

    writeFileSync(path.join(s.work, 'src/app/text.py'), lines(10, 'source'));
    const over = await run(tight);
    assert.equal(over.verdict, 'fail', 'HUMAN gates: the plan gate blocks');
    assert.match(budgetFindings(over)[0].message, /exceed the diff budget of 5/);
    assert.match(budgetFindings(over)[0].fix, /Diff budget: <N> lines/);

    const advisory = await run({ ...tight, gates: undefined });
    assert.equal(advisory.verdict, 'warn', 'the default advisory gate reports and lets the loop continue');
  } finally { s.cleanup(); }
});

test('an approved plan raises its own diff budget with one line', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    approvedPlan(s.work, 'bigger', ['src/app/text.py'], { extra: '\nDiff budget: 100 lines\n' });
    assert.equal(diffBudget({}, 'x\nDiff budget: 100 lines\n'), 100);
    assert.equal(diffBudget({ budget: { max_diff_lines: 7 } }, 'no line'), 7);
    assert.equal(diffBudget({}, 'no line'), 400);
    writeFileSync(path.join(s.work, 'src/app/text.py'), lines(50, 'source'));
    assert.deepEqual(budgetFindings(await run({ ...cfg(s.work), budget: { max_diff_lines: 5 } })), []);
  } finally { s.cleanup(); }
});

test('untracked files count; binary files do not', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const tight = { ...cfg(s.work), budget: { max_diff_lines: 5 } };
    writeFileSync(path.join(s.work, 'src/app/blob.bin'), Buffer.from([0, 1, 2, 0, 10, 0, 10]));
    assert.deepEqual(budgetFindings(await run(tight)), [], 'a binary file is not lines of code');
    writeFileSync(path.join(s.work, 'src/app/new_module.py'), lines(8, 'new'));
    assert.match(budgetFindings(await run(tight))[0].message, /^8 changed non-test lines/);
  } finally { s.cleanup(); }
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test test/scope-drift.test.mjs`
Expected: FAIL — `SyntaxError: The requested module ... does not provide an export named 'diffBudget'` (or `TEST_FILE`).

- [ ] **Step 3: Add `TEST_FILE`** — append to `.claude/harness/lib/diff.mjs`:

```js
// Test code by directory (tests/, test/, __tests__/, spec/) or by name (x.test.ts, x_test.go,
// x.spec.ts, test_x.py). One definition, read by the diff budget and by the eval comparison.
export const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[^/]+$|(^|\/)test_[^/]+$/;
```

- [ ] **Step 4: Add the rule** — in `.claude/harness/checks/scope-drift.mjs`:

Change the imports to:

```js
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as artifacts from '../lib/artifacts.mjs';
import { gateBlocks } from '../lib/config.mjs';
import { changedFiles, diff, git, unbornRepository, TEST_FILE } from '../lib/diff.mjs';
```

Add above `export async function run`:

```js
// why: agents produce diffs larger than anyone can review, and the size is discovered at review
// time when it is expensive to split. The approved plan states the budget; the diff is held to it.
const BUDGET_LINE = /^Diff budget:\s*(\d+)\s*lines?\s*$/mi;

export function diffBudget(cfg, planBody) {
  const declared = BUDGET_LINE.exec(planBody ?? '');
  return declared ? Number(declared[1]) : Number(cfg?.budget?.max_diff_lines ?? 400);
}

// Added plus deleted lines in non-test files. Binary files are not lines of code. Untracked files
// (local checks only) are absent from numstat and count as all-added.
function countChangedLines(cfg, files) {
  const pending = new Set(files.filter((f) => !TEST_FILE.test(f)));
  let total = 0;
  for (const row of diff(cfg, ['--numstat', '-z']).split('\0')) {
    const [added, deleted, file] = row.split('\t');
    if (!pending.has(file)) continue;
    pending.delete(file);
    if (added !== '-') total += Number(added) + Number(deleted);
  }
  if (cfg.diff) return total;
  for (const file of pending) {
    const full = path.join(cfg.layout.root, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    if (text.includes('\0')) continue;
    total += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  }
  return total;
}
```

At the end of `run`, replace the final `return graded(cfg, findings);` with:

```js
  const planPath = `.claude/harness/artifacts/${plans[0].slug}/plan.md`;
  const budget = diffBudget(cfg, artifacts.read(cfg, plans[0].slug, 'plan')?.body);
  const changedLines = countChangedLines(cfg, product);
  if (changedLines > budget) findings.push({
    file: planPath, line: 0, gate: 'plan', rule: 'diff-budget',
    message: `${changedLines} changed non-test lines exceed the diff budget of ${budget}`,
    fix: `split the change into smaller slices, or declare "Diff budget: <N> lines" in ${plans[0].slug}/plan.md with the reason and re-approve it`,
  });

  return graded(cfg, findings);
```

- [ ] **Step 5: Default and template** — in `.claude/harness/lib/config.mjs` change

```js
    budget: { max_findings: 20, ...(raw.budget ?? {}) },
```

to

```js
    budget: { max_findings: 20, max_diff_lines: 400, ...(raw.budget ?? {}) },
```

In `.claude/harness/templates/harness.toml`, inside `[budget]`, add after `max_findings`:

```toml
max_diff_lines        = 400     # non-test lines one change may add+delete; a plan raises it with "Diff budget: <N> lines"
```

- [ ] **Step 6: Tell the planner** — in `.claude/harness/skills/plan/SKILL.md`, at the end of the `## Files` section (after the "A directory … claims everything under it" paragraph) add:

```markdown
A change is held to 400 changed non-test lines (`[budget] max_diff_lines`). If it genuinely needs
more, write `Diff budget: <N> lines` on its own line here and say why; otherwise split it.
```

- [ ] **Step 7: Run the tests, then the suite**

Run: `node --test test/scope-drift.test.mjs` → PASS
Run: `node --test test/*.test.mjs` → all pass. If a test that counts `[budget]` keys or skill tokens fails, read its assertion: update an expected count only when it measures the file you changed; never raise a `[limits]` value.

- [ ] **Step 8: Commit**

```bash
git add .claude/harness/lib/diff.mjs .claude/harness/checks/scope-drift.mjs .claude/harness/lib/config.mjs \
  .claude/harness/templates/harness.toml .claude/harness/skills/plan/SKILL.md test/scope-drift.test.mjs
git commit -m "scope-drift: hold a change to its plan's diff budget"
```

---

### Task 3: Blast-radius risk tiers for the review

Paths decide the tier. A changed file — or a path the plan owns — matching `[review] high_risk` makes the change **high**: evaluator at `[effort] review` and a PR that says a person must read the diff. Everything else is **low**: evaluator at `[review] low_effort`, and the PR says the AI review plus the human merge decision is the path. The evaluator model is unchanged in both tiers (generator ≠ evaluator stays true). This task also fixes a latent defect: `[effort] review` is logged but never passed to the review CLI.

**Files:**
- Create: `.claude/harness/lib/risk.mjs`
- Modify: `.claude/harness/lib/config.mjs` (`review:` in `loadConfig`, validation, `stageModel`)
- Modify: `.claude/harness/lib/review.mjs` (`reviewArgs`, `review` signatures)
- Modify: `.claude/harness/lib/deliver.mjs` (imports, `runReviewPhase`, `prBody` and its call at ~line 451)
- Modify: `.claude/harness/bin/harness` (both `review({` calls, ~lines 671 and 700; import)
- Modify: `.claude/harness/templates/harness.toml` (new `[review]`)
- Test: `test/risk.test.mjs` (new), `test/review.test.mjs`, `test/deliver.test.mjs`

**Interfaces:**
- Produces: `export const DEFAULT_HIGH_RISK: string[]`, `export function globToRegExp(pattern: string): RegExp`, `export function riskTier(cfg, files: string[]): { tier: 'high'|'low', matched: { file: string, pattern: string }[] }` in `lib/risk.mjs`.
- Produces: `stageModel(cfg, phase, { tier = 'high' } = {})` — tier only affects `review`.
- Produces: `review({ ..., effort = null })` and `reviewArgs({ ..., effort = null })` add `--effort <effort>`.
- Produces: `state.risk` in the deliver phase record; `## Risk` section in the PR body.

- [ ] **Step 1: Write the failing tests** — create `test/risk.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, riskTier, DEFAULT_HIGH_RISK } from '../.claude/harness/lib/risk.mjs';

test('glob patterns match whole path segments', () => {
  assert.ok(globToRegExp('**/migrations/**').test('db/migrations/001_init.sql'));
  assert.ok(globToRegExp('**/migrations/**').test('migrations/001.sql'));
  assert.ok(!globToRegExp('**/auth/**').test('src/author.ts'));
  assert.ok(globToRegExp('**/*.sql').test('schema.sql'));
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'));
  assert.ok(globToRegExp('.github/workflows/**').test('.github/workflows/ci.yml'));
  assert.ok(!globToRegExp('a.b').test('axb'), 'a dot is a dot');
});

test('a change is high risk when any path matches, and it says which', () => {
  const cfg = { review: { high_risk: DEFAULT_HIGH_RISK } };
  assert.deepEqual(riskTier(cfg, ['src/calc.ts', 'tests/calc.test.ts']), { tier: 'low', matched: [] });
  assert.deepEqual(riskTier(cfg, ['src/calc.ts', 'db/migrations/002.sql']).matched,
    [{ file: 'db/migrations/002.sql', pattern: '**/migrations/**' }]);
  assert.equal(riskTier({}, ['src/auth/']).tier, 'high', 'a plan that claims a directory is judged by the claim');
  assert.equal(riskTier({ review: { high_risk: [] } }, ['db/migrations/1.sql']).tier, 'low', 'an empty list is a choice');
});
```

Append to `test/review.test.mjs`:

```js
test('the review effort reaches the CLI', () => {
  const s = candidateRepo();
  try {
    let args = null;
    review({ root: s.work, base: s.base, candidate: s.candidate, model: 'test-evaluator', output: 'effort.md', effort: 'medium',
      invoke: (a) => { args = a; return { status: 0, stdout: JSON.stringify({ result: 'approve', total_cost_usd: 0.01 }) }; } });
    assert.equal(args[args.indexOf('--effort') + 1], 'medium');
  } finally { s.cleanup(); }
});
```

Append to `test/deliver.test.mjs`:

```js
test('the review tier follows the paths: low buys the low effort, high names the paths on the PR', async () => {
  const low = delivery();
  try {
    await deliver(low.cfg, SLUG, low.fakes);
    assert.equal(low.calls.reviews[0].effort, 'medium');
    assert.match(low.calls.prs[0].body, /## Risk\n\n\*\*Low\*\*/);
    assert.equal(readState(low.cfg, SLUG).risk.tier, 'low');
  } finally { low.s.cleanup(); }
  const high = delivery({ review: { high_risk: ['src/app/**'], low_effort: 'medium' } });
  try {
    await deliver(high.cfg, SLUG, high.fakes);
    assert.equal(high.calls.reviews[0].effort, 'high');
    assert.match(high.calls.prs[0].body,
      /\*\*High\*\* — a person reads this diff before merging\. It touches `src\/app\/text\.py` \(`src\/app\/\*\*`\)/);
  } finally { high.s.cleanup(); }
});

test('a misspelled low_effort fails at config load, not mid-run', () => {
  const d = delivery();
  try {
    const file = path.join(d.s.work, '.claude/harness/harness.toml');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n[review]\nlow_effort = "meduim"\n`);
    assert.throws(() => loadConfig(d.s.work), /\[review\] low_effort must be one of low, medium, high/);
  } finally { d.s.cleanup(); }
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test test/risk.test.mjs test/review.test.mjs test/deliver.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/risk.mjs'`; the effort test finds no `--effort`; the tier test finds `effort` undefined.

- [ ] **Step 3: Create `.claude/harness/lib/risk.mjs`**

```js
// why: every change bought the same frontier review at high effort whatever it touched, and the
// first live run spent 66% of its cost there. The paths a person must read decide the tier — the
// review triage Duckbill, Anthropic and OpenAI describe — and nothing else does.
export const DEFAULT_HIGH_RISK = ['**/migrations/**', '**/*.sql', '**/auth/**', '**/security/**',
  '.github/workflows/**', '**/schema.*'];

export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function riskTier(cfg, files) {
  const compiled = (cfg?.review?.high_risk ?? DEFAULT_HIGH_RISK).map((p) => [p, globToRegExp(p)]);
  const matched = [];
  for (const file of new Set(files)) {
    const hit = compiled.find(([, re]) => re.test(file));
    if (hit) matched.push({ file, pattern: hit[0] });
  }
  return { tier: matched.length ? 'high' : 'low', matched };
}
```

- [ ] **Step 4: Config** — in `.claude/harness/lib/config.mjs`:

Add the import at the top:

```js
import { DEFAULT_HIGH_RISK } from './risk.mjs';
```

Change `stageModel`'s signature and its `review` case:

```js
export function stageModel(cfg, phase, { tier = 'high' } = {}) {
```

```js
    case 'review': return { model: models.evaluator,
      effort: tier === 'low' ? (cfg?.review?.low_effort ?? 'medium') : effort.review };
```

In the object `loadConfig` builds, next to `budget:`, add:

```js
    // Paths a person reads before merge. The tier they produce picks the review effort and what
    // the pull request asks of its reader; see lib/risk.mjs.
    review: { high_risk: DEFAULT_HIGH_RISK, low_effort: 'medium', ...(raw.review ?? {}) },
```

Immediately before `loadConfig` returns `cfg`, add:

```js
  if (!EFFORT_LEVELS.includes(cfg.review.low_effort)) {
    throw new Error(`[review] low_effort must be one of ${EFFORT_LEVELS.join(', ')}, got "${cfg.review.low_effort}"`);
  }
```

(If `loadConfig` returns an object literal directly, first assign it to `const cfg = { … }`, then validate, then `return cfg;`.)

- [ ] **Step 5: Review CLI effort** — in `.claude/harness/lib/review.mjs`:

```js
export function reviewArgs({ model, prompt, budgetUsd, schema = null, effort = null }) {
  // G17. ...existing comment...
  return ['-p', prompt, '--model', model, ...(effort ? ['--effort', effort] : []), ...(schema ? ['--json-schema', schema] : []), '--tools', 'Read,Grep,Glob',
```

(rest of the array unchanged). Add `effort = null,` to `review`'s destructured parameters (after `schema = null,`) and pass it: `invoke(reviewArgs({ model, prompt, budgetUsd, schema, effort }), {`.

- [ ] **Step 6: Deliver** — in `.claude/harness/lib/deliver.mjs`:

Add the import:

```js
import { riskTier } from './risk.mjs';
```

In `runReviewPhase`, replace

```js
    const { model, effort } = stageModel(cfg, 'review');
    event('review', 'model-turn', { model, effort, stage: 'review' });
```

with

```js
    // The tier is judged on what changed and on what the plan claims, so a directory claim over
    // src/auth/ is high risk before its first file changes.
    const changed = git(root, 'diff', '--name-only', state.base, 'HEAD').split('\n').filter(Boolean);
    state.risk = riskTier(cfg, [...changed, ...owns]);
    save();
    const { model, effort } = stageModel(cfg, 'review', { tier: state.risk.tier });
    event('review', 'model-turn', { model, effort, stage: 'review', risk: state.risk.tier });
```

and add `effort,` to the object passed to `review({ … })` in the same function.

Change `prBody`'s signature to accept `risk = null`:

```js
function prBody({ slug, spec, plan, review, invocation, bounds: b, usd, gates, scope, suppressions = [], risk = null }) {
```

and insert this block immediately before `...(suppressions.length ? [`:

```js
    '## Risk',
    '',
    risk?.tier === 'high'
      ? `**High** — a person reads this diff before merging. It touches ${risk.matched.map((m) => `\`${m.file}\` (\`${m.pattern}\`)`).join(', ')}.`
      : '**Low** — no changed or planned path matches `[review] high_risk`. The review above and the checks are the evidence; merging is still a person\'s decision.',
    '',
```

At the `prBody({ … })` call (~line 451) add `risk: state.risk,`.

- [ ] **Step 7: `harness review` passes the configured effort** — in `.claude/harness/bin/harness` change

```js
import { loadConfig, VERBS } from '../lib/config.mjs';
```

to

```js
import { loadConfig, VERBS, stageModel } from '../lib/config.mjs';
```

and add `effort: stageModel(cfg, 'review').effort,` to both `review({ root: cfg.layout.root, … })` calls (~lines 671 and 700). A manual review is judged at the high tier.

- [ ] **Step 8: Template** — append to `.claude/harness/templates/harness.toml`, before `[limits]`:

```toml
# Paths a person reads before merge. A changed file or a plan-owned path matching one makes the
# change high risk: the evaluator runs at [effort] review and the pull request says a human review
# is required. Everything else is low risk: the evaluator runs at low_effort, and the AI review
# plus the human merge decision is the path. `high_risk = []` is a valid choice.
[review]
high_risk  = ["**/migrations/**", "**/*.sql", "**/auth/**", "**/security/**", ".github/workflows/**", "**/schema.*"]
low_effort = "medium"
```

- [ ] **Step 9: Run the tests, then the suite**

Run: `node --test test/risk.test.mjs test/review.test.mjs test/deliver.test.mjs` → PASS
Run: `node --test test/*.test.mjs` → all pass. The existing first deliver test asserts the PR body line by line; the new `## Risk` section sits between `## Review` and `## Run`, and none of its assertions depend on adjacency. If one does, update it to expect the section.

- [ ] **Step 10: Commit**

```bash
git add .claude/harness/lib/risk.mjs .claude/harness/lib/config.mjs .claude/harness/lib/review.mjs \
  .claude/harness/lib/deliver.mjs .claude/harness/bin/harness .claude/harness/templates/harness.toml \
  test/risk.test.mjs test/review.test.mjs test/deliver.test.mjs
git commit -m "review: tier the review by the paths a change touches, and pass its effort to the CLI"
```

---

### Task 4: Strip development history from shipped prompts and templates

Consumer sessions load `skills/`, `roles/`, `policies/` and `templates/`. Tags like `G16`, `Law 5` and `Item 6`, and paths under `docs/history/`, carry no instruction and point at files a consumer does not have. The `## Reusing a proven product procedure` section of the review policy is entirely this repository's history — and after Task 1 it is in every review prompt.

**Files:**
- Create: `test/shipped-prompts.test.mjs`
- Modify: `.claude/harness/policies/review.md` (delete the last section)
- Modify: `examples/scratch-py/.claude/harness/policies/review.md`, `examples/scratch-ts/.claude/harness/policies/review.md` (same deletion — they are install copies)
- Modify: `.claude/harness/templates/project-instructions.md` (delete the G16 sentence)
- Modify: `.claude/harness/templates/harness.toml` (tags)

- [ ] **Step 1: Write the failing test** — create `test/shipped-prompts.test.mjs`:

```js
// why: consumer sessions load these files. This repository's development history in them is
// tokens with no instruction in them, and paths that do not exist in a consumer's tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { A } from './_paths.mjs';

const HISTORY = [/\bG\d{2}\b/, /\bLaw \d+\b/, /\bItem \d+\b/, /docs\/history/, /\bMEASURED \d{4}/, /\blean-v2\b/, /evidence\.md F\d+/];

function shipped() {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|toml|yml)$/.test(e.name)) files.push(p);
    }
  };
  for (const dir of ['skills', 'roles', 'policies', 'templates']) walk(path.join(A, dir));
  return files;
}

test('shipped prompts and templates carry no development history', () => {
  const hits = [];
  for (const file of shipped()) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (HISTORY.some((re) => re.test(line))) hits.push(`${path.relative(A, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test test/shipped-prompts.test.mjs`
Expected: FAIL listing at least `policies/review.md:44`, `policies/review.md:49`, `templates/project-instructions.md:26`, and the `templates/harness.toml` lines tagged `Law 3`, `G14`, `G11`, `G06`, `G09`, `Law 5`, `G10`.

- [ ] **Step 3: Delete the history section** — in `.claude/harness/policies/review.md` delete from the heading `## Reusing a proven product procedure` to the end of the file. Apply the identical deletion to both `examples/scratch-*/.claude/harness/policies/review.md` copies. Keep the `## Product and design evolution` section: `test/host-evidence.test.mjs` asserts its "merge authority is the host's" sentence.

- [ ] **Step 4: Delete the G16 sentence** — in `.claude/harness/templates/project-instructions.md` delete these two lines under `## Commands` (and the blank line after them):

```
G16: each line says what healthy output looks like, because "run the checks" without that is an
instruction whose result nobody can grade.
```

- [ ] **Step 5: Drop the tags from the template registry**

```bash
sed -i '' -E 's/^# (G[0-9]{2}|Law [0-9]+)\. /# /; s/ \(Law 3\)//' .claude/harness/templates/harness.toml
```

- [ ] **Step 6: Run the test; fix any remaining hit by the same rule**

Run: `node --test test/shipped-prompts.test.mjs`
For each remaining hit, delete the tag and keep the sentence if it instructs the reader; delete the sentence if it only narrates how the harness came to be. Re-run until PASS.

- [ ] **Step 7: Suite**

Run: `node --test test/*.test.mjs` → all pass. If a test asserts on a deleted sentence (search `git grep -n "proven product procedure\|healthy output looks like" test`), delete that assertion only; it tested the history, not a behaviour.

- [ ] **Step 8: Commit**

```bash
git add test/shipped-prompts.test.mjs .claude/harness/policies/review.md .claude/harness/templates \
  examples/scratch-py/.claude/harness/policies/review.md examples/scratch-ts/.claude/harness/policies/review.md
git commit -m "prompts: ship instructions, not this repository's history"
```

---

### Task 5: The comparison counts changed lines per accepted change

G24's verdict asks acceptance, cost and defects. It never asks the question the harness exists for: *does it produce less code for the same accepted behaviour?* Add a `size` criterion: the harness arm's changed source lines per accepted change must be within 10% of native's, same shape as the cost criterion.

**Files:**
- Create: `evals/lib/size.mjs`
- Modify: `evals/lib/campaign.mjs:434`, `evals/lib/driver-campaign.mjs:170` (after the `Accepted` commit)
- Modify: `evals/lib/comparison.mjs` (`summarizeComparisons`, `g24Verdict`)
- Test: `test/size.test.mjs` (new), `test/driver-campaign.test.mjs:120-151`

**Interfaces:**
- Consumes: `TEST_FILE` from `.claude/harness/lib/diff.mjs` (Task 2).
- Produces: `changedLines(root, from, to, files) -> { source: number, test: number }`; `result.sourceLines`, `result.testLines` on a campaign result; `sourceLines`, `testLines`, `sourceLinesPerAcceptedChange` on each summary group; `verdict.size = { native, harness, ceiling, pass }`.

- [ ] **Step 1: Write the failing tests** — create `test/size.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { changedLines } from '../evals/lib/size.mjs';

test('changed lines split source from tests and ignore files outside the step', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'size-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    mkdirSync(path.join(root, 'src')); mkdirSync(path.join(root, 'tests'));
    writeFileSync(path.join(root, 'src/calc.mjs'), 'a\nb\n');
    git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'base');
    const from = git('rev-parse', 'HEAD');
    writeFileSync(path.join(root, 'src/calc.mjs'), 'a\nc\nd\n');      // -1 +2 = 3
    writeFileSync(path.join(root, 'tests/calc.test.mjs'), 'x\ny\n');  // +2
    writeFileSync(path.join(root, 'README.md'), 'outside\n');         // not in the step
    git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'step');
    const to = git('rev-parse', 'HEAD');
    assert.deepEqual(changedLines(root, from, to, ['src/calc.mjs', 'tests/calc.test.mjs']), { source: 3, test: 2 });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
```

In `test/driver-campaign.test.mjs`, in the test `'the driver pair is reachable only by name, …'`, add `sourceLines: 100` to the native row's `result` and `sourceLines: 105` to the harness row's `result`, and after `assert.equal(verdict.defects.pass, true);` add:

```js
  assert.equal(verdict.size.pass, true, JSON.stringify(verdict.size));
  assert.equal(verdict.size.ceiling, 20 * 1.1);
  // More code for the same accepted behaviour fails, however cheap it was.
  const wordier = summarizeComparisons([rows[0], { ...rows[1], result: { ...rows[1].result, sourceLines: 140 } }]);
  assert.equal(g24Verdict(wordier, { repetitions: 1 }).size.pass, false);
  assert.equal(g24Verdict(wordier, { repetitions: 1 }).pass, false);
  // No line count is not a pass.
  const unmeasured = summarizeComparisons([rows[0], { ...rows[1], result: { ...rows[1].result, sourceLines: undefined } }]);
  assert.equal(g24Verdict(unmeasured, { repetitions: 1 }).size.pass, false);
```

(100 lines / 5 accepted changes = 20 per change; 105 / 5 = 21 ≤ 22; 140 / 5 = 28 > 22.)

- [ ] **Step 2: Run and watch them fail**

Run: `node --test test/size.test.mjs test/driver-campaign.test.mjs`
Expected: FAIL — `Cannot find module '.../evals/lib/size.mjs'`; `verdict.size` is undefined.

- [ ] **Step 3: Create `evals/lib/size.mjs`**

```js
// Changed lines between two revisions, split into source and tests, so the comparison can ask
// whether the harness produces less code for the same accepted behaviour.
import { execFileSync } from 'node:child_process';
import { TEST_FILE } from '../../.claude/harness/lib/diff.mjs';

export function changedLines(root, from, to, files) {
  const out = execFileSync('git', ['diff', '--numstat', '-z', '--no-renames', from, to, '--', ...files],
    { cwd: root, encoding: 'utf8' });
  const lines = { source: 0, test: 0 };
  for (const row of out.split('\0').filter(Boolean)) {
    const [added, deleted, file] = row.split('\t');
    if (added === '-') continue;
    lines[TEST_FILE.test(file) ? 'test' : 'source'] += Number(added) + Number(deleted);
  }
  return lines;
}
```

- [ ] **Step 4: Record per accepted change** — in both `evals/lib/campaign.mjs` and `evals/lib/driver-campaign.mjs`, add `import { changedLines } from './size.mjs';` to the imports, and immediately after the line that assigns `result.candidateRevision = commit(\`Accepted ${step.slug}\`)` insert:

```js
      { const approvedAt = result.decisions.findLast((d) => d.slug === step.slug && d.decision === 'approve').revision;
        const size = changedLines(s.work, approvedAt, result.candidateRevision, step.files);
        result.sourceLines = (result.sourceLines ?? 0) + size.source; result.testLines = (result.testLines ?? 0) + size.test; }
```

(In `campaign.mjs` that assignment and `result.completedSteps++` share line 434; split the line so the insert sits between them.)

- [ ] **Step 5: Summarise and judge** — in `evals/lib/comparison.mjs`, `summarizeComparisons`: add `sourceLines:0,testLines:0` to the group initialiser object; inside the loop add

```js
    g.sourceLines=g.sourceLines===null||a.result?.sourceLines==null?null:g.sourceLines+a.result.sourceLines;
    g.testLines+=a.result?.testLines??0;
```

and in the final loop add

```js
    g.sourceLinesPerAcceptedChange=g.sourceLines!=null&&g.acceptedChanges?g.sourceLines/g.acceptedChanges:null;
```

In `g24Verdict`, after the `cost` lines add

```js
  const size={native:n.sourceLinesPerAcceptedChange??null,harness:h.sourceLinesPerAcceptedChange??null};
  size.ceiling=size.native!=null?size.native*1.1:null;
  size.pass=size.native!=null&&size.harness!=null&&size.harness<=size.ceiling;
```

and change the return to include `size` and require it: `return {kind,repetitions,pilot:repetitions===0,acceptance,cost,size,defects,pass:acceptance.pass&&cost.pass&&size.pass&&defects.pass,`.

- [ ] **Step 6: Run the tests, then the suite**

Run: `node --test test/size.test.mjs test/driver-campaign.test.mjs test/comparison.test.mjs` → PASS
Run: `node --test test/*.test.mjs` → all pass.

- [ ] **Step 7: Commit**

```bash
git add evals/lib/size.mjs evals/lib/campaign.mjs evals/lib/driver-campaign.mjs evals/lib/comparison.mjs \
  test/size.test.mjs test/driver-campaign.test.mjs
git commit -m "evals: G24 asks whether the harness writes less code for the same accepted change"
```

---

### Task 6: README states the gates, the phase coverage and the freeze honestly

**Files:**
- Modify: `README.md` (intro at lines 3–5; paragraph at lines 448–450)

- [ ] **Step 1: Fix the intro** — replace

```
it through `intent → spec → plan → code → review`, stopping at three human approval gates, with
deterministic checks (tests, lint, secrets, plan scope-drift) enforced by hooks.
```

with

```
it through `intent → spec → plan → code → review`. Spec and plan approvals are advisory by default
(recorded, reported on the pull request, not blocking); merge is always a person's decision.
Deterministic checks (tests, lint, secrets, plan scope, diff size) run through hooks, and the AI
review is tiered by the paths a change touches.
```

- [ ] **Step 2: Replace the Deploy/Maintain paragraph** — replace the paragraph beginning `Plan, Design, Build, and Test run locally.` with:

```markdown
### What the harness covers, phase by phase

| Phase | The harness | You |
|---|---|---|
| Plan | `intent` and `spec` skills; spec approval (advisory) | the requirement decision |
| Design | `design` and `plan` skills; plan approval (advisory); `## Files` fixes scope | the architecture decision |
| Build | `implement` skill; post-write checks; `harness deliver` | — |
| Test | check stages; scope, diff budget and tamper checks; AI review tiered by risk | reading high-risk diffs; the merge |
| Deploy | a time-bound human release record; a consumer CI template | the pipeline, rollout and rollback |
| Maintain | `diagnose` skill; `examples/maintain/band-to-intent.mjs`; productivity-event import for metrics | monitoring, alerting, incident response |

The harness ships no deployment or monitoring code, on purpose: those belong to your platform.
What it asks of them is evidence — events it can import and measure.

### Status: feature freeze

No new control, skill or check lands until the G24 comparison on the `calculator` workload passes
on all four criteria — acceptance, cost per accepted change, changed source lines per accepted
change, and caught defects — against native Claude Code. The last recorded pilots (2026-09-16):
native accepted 2 of 2 awake runs at about USD 0.13 and 0.9 minutes each; the harness accepted
1 of 4 at USD 0.21–0.58 and 3–25 minutes.
```

- [ ] **Step 3: Suite** — `node --test test/*.test.mjs` → all pass (`test/install.test.mjs` and `test/host-evidence.test.mjs` read the README; neither touches these lines).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "readme: advisory gates, phase coverage and the feature freeze, stated plainly"
```

---

### Task 7: Archive history out of the main tree

Everything removed stays reachable at one tag. Keep every document a test or code reads: `OPERATING`, `CONSTITUTION`, `COMPATIBILITY`, `BUILD-PLAN`, `IMPROVEMENT-PLAN`, `OPTIONAL-MODULE-EVIDENCE`, `PRODUCTIVITY-EVENTS`, `PRODUCTION-READINESS`, and `docs/superpowers/`. Keep the four evidence files `evals/lib/optional-evidence.mjs` and `evals/run.mjs` read.

**Files:**
- Delete: `docs/history/`; `docs/{ANTHROPIC-AI-NATIVE-SDLC-AUDIT-2026-09-18,COMPLETION-PLAN-2026-09-12,CONTROLLED-PILOT,DEFECT-REPAIR-PLAN,DEPLOY-MAINTAIN-EVIDENCE,GAP-ANALYSIS-2026-09-12,LEAN-HARNESS-IMPLEMENTATION-BACKLOG,LEAN-HARNESS-RESEARCH-PROPOSAL,PRODUCTION-IMPLEMENTATION-PLAN-2026-09-18,SPDD-TEAM-EVOLUTION-PLAN,final_impl,optimized-prompt}.md`; `evals/evidence/{deliver-first-run-2026-09-15,g24-calculator-pilots-2026-09-16,examples}/`; `evals/evidence/{pruning-summary,product-summary,retrieval-comparison-aborted}.json`; `evals/evidence/smoke/{guidance-comparison,initial-sandbox-attempt}.json`
- Modify: `test/layout.test.mjs`, `evals/evidence/README.md`, comments that cite moved paths

- [ ] **Step 1: Tag the pre-archive tree** (local only; pushing it is the owner's call)

```bash
git tag archive/history-2026-09-28
```

- [ ] **Step 2: Update the layout test first** — in `test/layout.test.mjs`: change `EXEMPT` to

```js
const EXEMPT = [':!docs/superpowers', ':!test/layout.test.mjs'];
```

delete the whole test `'historical artifacts keep their .aidlc references'`; change the header comment's "Three paths keep their references and are exempt" to "Two paths keep their references and are exempt"; and change "live under docs/history/" in the later comment to "are archived at the tag archive/history-2026-09-28".

- [ ] **Step 3: Remove**

```bash
git rm -rq docs/history evals/evidence/deliver-first-run-2026-09-15 evals/evidence/g24-calculator-pilots-2026-09-16 evals/evidence/examples
git rm -q docs/ANTHROPIC-AI-NATIVE-SDLC-AUDIT-2026-09-18.md docs/COMPLETION-PLAN-2026-09-12.md docs/CONTROLLED-PILOT.md \
  docs/DEFECT-REPAIR-PLAN.md docs/DEPLOY-MAINTAIN-EVIDENCE.md docs/GAP-ANALYSIS-2026-09-12.md \
  docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md docs/LEAN-HARNESS-RESEARCH-PROPOSAL.md \
  docs/PRODUCTION-IMPLEMENTATION-PLAN-2026-09-18.md docs/SPDD-TEAM-EVOLUTION-PLAN.md docs/final_impl.md docs/optimized-prompt.md \
  evals/evidence/pruning-summary.json evals/evidence/product-summary.json evals/evidence/retrieval-comparison-aborted.json \
  evals/evidence/smoke/guidance-comparison.json evals/evidence/smoke/initial-sandbox-attempt.json
```

- [ ] **Step 4: Repoint citations to the tag**

```bash
git grep -l -e 'docs/history/' -e 'evals/evidence/deliver-first-run' -e 'evals/evidence/g24-calculator-pilots' -- ':!test/layout.test.mjs' \
  | xargs sed -i '' -e 's#docs/history/#archive/history-2026-09-28:docs/history/#g' \
                    -e 's#evals/evidence/deliver-first-run#archive/history-2026-09-28:evals/evidence/deliver-first-run#g' \
                    -e 's#evals/evidence/g24-calculator-pilots#archive/history-2026-09-28:evals/evidence/g24-calculator-pilots#g'
```

Then in `evals/evidence/README.md` delete the table rows for `product-summary.json`, `pruning-summary.json`, `smoke/guidance-comparison.json` and `smoke/initial-sandbox-attempt.json`, and add one sentence: "Earlier curated runs are archived at the tag `archive/history-2026-09-28`." In `README.md`'s `## Further reading`, add: "- Development history — archived at the git tag `archive/history-2026-09-28`".

- [ ] **Step 5: Verify nothing live read a removed file**

Run: `git grep -n -e 'docs/\(ANTHROPIC\|COMPLETION\|CONTROLLED\|DEFECT-REPAIR\|DEPLOY-MAINTAIN\|GAP-ANALYSIS\|LEAN-HARNESS\|PRODUCTION-IMPL\|SPDD\|final_impl\|optimized-prompt\)' -e 'pruning-summary\|product-summary\|retrieval-comparison-aborted\|guidance-comparison\|initial-sandbox-attempt' -- ':!docs/superpowers'`
Expected: only comments or prose. Any `readFileSync`/`read(` hit means that file is live — restore it with `git checkout HEAD -- <path>` and drop it from this task.

- [ ] **Step 6: Suite** — `node --test test/*.test.mjs` → all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "archive: development history moves to the archive/history-2026-09-28 tag"
```

---

### Task 8: Measure — one calculator pilot, both arms (owner go-ahead required)

This spends real money. Stop and ask the owner before Step 2, quoting the estimate: **≤ 25 minutes, ≤ USD 4, expected ≈ USD 1–2**.

**Files:**
- Modify (by the runner): `evals/evidence/g24-driver-comparison.json`
- Modify: `README.md` (`### Status: feature freeze` numbers)

- [ ] **Step 1: Preconditions**

Run: `git status --short` → empty (a dirty runtime path skips every control; see memory `dirty-runtime-path-breaks-suite`).
Run: `node --test test/*.test.mjs` → all pass.
Run: `claude --version` and `gh auth status` → both succeed.

- [ ] **Step 2: Run the pilot** (after the owner says go)

```bash
node evals/run.mjs --live --compare --comparison driver --id calculator \
  --repeats 0 --boundary local --max-suite-usd 4 --max-suite-minutes 25
```

The runner holds an idle-sleep assertion (`evals/lib/awake.mjs`) and marks any run that slept anyway.

- [ ] **Step 3: Read the verdict**

Run: `node -e "const v=require('./evals/evidence/g24-driver-comparison.json');console.log(JSON.stringify({summary:v.summary,verdict:v.verdict},null,2))"`
Report, per arm: accepted, USD, minutes, `sourceLinesPerAcceptedChange`, and each criterion's `pass`. A slept or incomplete run is reported as unmeasured, never as a result.

- [ ] **Step 4: Record** — update the numbers in `README.md`'s `### Status: feature freeze` paragraph with this run's figures and date. Leave the freeze in place unless `verdict.pass` is `true` *and* the owner decides a single pilot (`repeats 0`) is enough to lift it.

- [ ] **Step 5: Commit**

```bash
git add evals/evidence/g24-driver-comparison.json README.md
git commit -m "evidence: G24 calculator pilot after the audit changes"
```

---

## Self-review notes

- **Spec coverage:** 1 → Tasks 1, 2 · 2 → Task 3 · 3 → no task by decision (Global Constraints pins it) · 4 → Task 4 · 5 → Tasks 5, 6 (freeze), 8 · 6 → Task 6 · 7 → Task 7.
- **Defects found while planning, fixed inside their tasks:** the review policy never reached a plan-scoped reviewer (Task 1); `[effort] review` never reached the review CLI (Task 3).
- **Order matters:** Task 4 runs after Task 1 (same policy file). Task 5 depends on Task 2's `TEST_FILE`. Task 8 measures the harness after Tasks 1–4 change it.
