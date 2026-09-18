# Move the Harness to `.claude/harness/` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the harness from `.aidlc/` to `.claude/harness/`, landing on `main` as one atomic commit, with the test suite back at full parity.

**Architecture:** A mechanical path rename plus nine hand edits, executed on a feature branch with one commit per task, then squash-merged to `main` as a single commit. The squash is not cosmetic: `runtime-identity.mjs` hashes the harness's own paths and diffs them against `git ls-tree HEAD`, so only a fully-committed tree can verify. Historical artifact prose is excluded from every rewrite.

**Tech Stack:** Node.js (ESM, `node --test`), git, perl for in-place rewriting. No package.json at the repo root; the suite runs as `node --test test/*.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-18-aidlc-to-claude-design.md`

## Global Constraints

- **Test parity target: 624 tests, 623 pass, 1 skipped, 0 fail** (measured 2026-09-18, ~84s).
- **Never rewrite three paths.** Every `git ls-files` used for rewriting must carry the pathspec `':!.claude/harness/artifacts' ':!docs/superpowers' ':!test/layout.test.mjs'`.
  - `.claude/harness/artifacts/` — 6,371 occurrences across 238 files; a historical record, must end unchanged.
  - `docs/superpowers/` — 2 files, 84 occurrences; the spec and this plan describe the move and must keep naming its source path.
  - `test/layout.test.mjs` — holds `.aidlc` as its literal search pattern; rewriting it makes the guard search for the wrong string and pass vacuously.
- **Do not rename the `AIDLC_UNATTENDED` environment variable** (`lib/deliver.mjs:227`). It is not a path. This change is a relocation only.
- **Do not hand-edit generated files:** root `CLAUDE.md`, `.claude/settings.json`, `CODEBASE-MAP.md`, `.claude/harness/hooks.json`, consumer `bin/harness` shims, consumer `harness-install.json`. Regenerate them (Task 4, Task 5).
- **Do not run the harness delivery workflow.** The project instruction forbids `harness new`, creating `artifacts/`, or resuming AIDLC stages here. `harness doctor`, `harness map`, `harness init` and `harness check` are verification and regeneration, and are permitted.
- **No backward compatibility.** No `harness migrate`, no `.aidlc` fallback in `findRepoRoot`, no compat test.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

| Path | Responsibility after the change |
|---|---|
| `.claude/harness/` | The whole harness: config, executable, libraries, checks, artifacts |
| `.claude/harness/hooks.json` | Generated Claude hooks projection (was `adapters/claude/hooks.json`) |
| `.claude/skills/`, `.claude/agents/` | Reserved for the user's own; must stay absent or empty |
| `.claude-plugin/plugin.json` | Points at `./.claude/harness/...`; description loses the neutrality wording |
| `test/layout.test.mjs` | **New.** Guards the invariant: no `.aidlc` outside artifacts, ever again |

---

### Task 1: Pin the invariant, then perform the move

The whole rename is one indivisible unit — the suite cannot be green while paths are half-moved — so it gets one task with a test-first anchor.

**Files:**
- Create: `test/layout.test.mjs`
- Rename: `.aidlc/` → `.claude/harness/` (385 tracked files)
- Delete: `.aidlc/state/`, `.aidlc/evals/` (untracked), `.claude/harness/adapters/`
- Modify (hand edits): `.claude/harness/lib/runtime-identity.mjs`, `lib/projection.mjs`, `lib/paths.mjs`, `lib/config.mjs`, `bin/harness`, `harness.toml`, `.gitignore`, `.claude-plugin/plugin.json`
- Modify (scripted): all other tracked files except `.claude/harness/artifacts/`

**Interfaces:**
- Produces: `.claude/harness/bin/harness` as the executable path; `layout()` from `lib/paths.mjs` with its `aidlc` key renamed to `harness`; every later task consumes both.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b move-harness-to-claude
```

- [ ] **Step 2: Write the failing test**

Create `test/layout.test.mjs`:

```javascript
// The harness lives at .claude/harness/. This guards the one invariant a path rename can
// silently lose: a stray `.aidlc` reference that still resolves on a developer's disk because
// their untracked state directory survived, and fails for everyone else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const grep = (...pathspec) => {
  try {
    return execFileSync('git', ['-C', ROOT, 'grep', '-I', '-l', '\\.aidlc', '--', ...pathspec],
      { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // git grep exits 1 on no match
    throw e;
  }
};

test('no tracked file outside artifacts references .aidlc', () => {
  assert.deepEqual(grep('.', ':!.claude/harness/artifacts', ':!docs/superpowers', ':!test/layout.test.mjs'), []);
});

test('the harness lives at .claude/harness and .aidlc is gone', () => {
  assert.ok(existsSync(path.join(ROOT, '.claude/harness/bin/harness')));
  assert.ok(!existsSync(path.join(ROOT, '.aidlc')));
});

test('historical artifacts keep their .aidlc references', () => {
  assert.equal(grep('.claude/harness/artifacts').length, 238);
});

test('the user-facing skill and agent directories stay free for the user', () => {
  for (const dir of ['.claude/skills', '.claude/agents']) {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) continue;
    assert.deepEqual(readdirSync(abs), [], `${dir} must stay empty`);
  }
});
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
node --test test/layout.test.mjs
```

Expected: FAIL. The first test reports 184 files, the second finds no `.claude/harness/bin/harness`, the third throws because the directory does not exist yet.

- [ ] **Step 4: Move the tree**

```bash
git mv .aidlc .claude/harness
rm -rf .claude/harness/state .claude/harness/evals
git rm -r --cached -q .claude/harness/adapters && rm -rf .claude/harness/adapters
```

- [ ] **Step 5: Rewrite every reference except the artifacts**

```bash
git ls-files -z -- . ':!.claude/harness/artifacts' ':!docs/superpowers' ':!test/layout.test.mjs' \
  | xargs -0 perl -pi -e 's{\.aidlc}{.claude/harness}g'
```

- [ ] **Step 6: Apply the nine hand edits**

`lib/runtime-identity.mjs` — the roots array is now correct from Step 5, but drop the deleted `adapters` root and confirm the entrypoint assertion reads `.claude/harness/bin/harness`:

```javascript
const roots = ['.claude/harness/bin', '.claude/harness/lib', '.claude/harness/checks',
               '.claude/harness/sensors', '.claude/harness/hooks', '.claude/harness/skills',
               '.claude/harness/roles', '.claude/harness/templates', '.claude/harness/policies',
               '.claude/harness/instructions.md', '.claude-plugin'];
```

`lib/projection.mjs:133` — drop the now-nonexistent path; `.claude/` already covers the harness:

```javascript
export const GENERATED_PATHS = ['CLAUDE.md', 'CODEBASE-MAP.md', '.claude/'];
```

`lib/projection.mjs` `renderClaudeHooks` — the generated projection moves out of `adapters/`. Change its written destination to `.claude/harness/hooks.json` and confirm the `commandRoot` default is now `${CLAUDE_PLUGIN_ROOT}/.claude/harness/bin/harness`.

`lib/paths.mjs` — replace the header comment (it asserts agent-neutrality, which is retired), rename the `aidlc` layout key to `harness`, and reduce `findRepoRoot` to a single probe:

```javascript
// The harness lives under .claude/harness/. Claude Code is the only supported runtime.
export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, '.claude', 'harness'))) return dir;
    if (existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}
```

Renaming the `aidlc` key means updating every `layout().aidlc` and `cfg.layout.aidlc` reader. Find them:

```bash
git grep -n 'layout\.aidlc\|L\.aidlc\|\.aidlc\b' -- . ':!.claude/harness/artifacts'
```

`lib/config.mjs:97` — the graph scan root:

```javascript
graph: { include: ['.', '.claude/harness'], exclude: ['node_modules', '.venv', 'dist', 'target', '.git', '.claude/worktrees'], ...(raw.graph ?? {}) },
```

`.claude/worktrees` is added explicitly: it holds three full repository checkouts and is now a sibling of the harness.

`bin/harness:67-72` — the generated settings allowlist:

```javascript
const ALLOW = [
  'Edit(.claude/harness/artifacts/**)',
  'Bash(.claude/harness/bin/harness:*)',
  'Bash(node .claude/harness/bin/harness:*)',
  'Write(.claude/harness/artifacts/**)',
];
```

`harness.toml:13` — `arch = "node .claude/harness/sensors/architecture.mjs"` (Step 5 already did this; verify).

`.gitignore` — confirm Step 5 retargeted all six entries, and that `.claude/worktrees/` is still ignored.

`.claude-plugin/plugin.json` — retire the neutrality wording in `description` and drop the adapter hop:

```json
{
  "description": "The AIDLC delivery harness for Claude Code, under .claude/harness/.",
  "skills": "./.claude/harness/skills/",
  "agents": ["./.claude/harness/roles/explorer.md", "./.claude/harness/roles/evaluator.md", "./.claude/harness/roles/verifier.md"],
  "hooks": "./.claude/harness/hooks.json"
}
```

- [ ] **Step 7: Run the guard test**

```bash
node --test test/layout.test.mjs
```

Expected: PASS, all four tests.

- [ ] **Step 8: Run the full suite**

```bash
node --test test/*.test.mjs 2>&1 | tail -10
```

Expected: `pass 627, fail 0, skipped 1` — the 623 baseline passes plus the 4 new guard tests. Any failure here is a missed reference; fix and re-run before committing.

- [ ] **Step 9: Confirm the artifacts are untouched**

```bash
git diff --stat HEAD -- .claude/harness/artifacts
```

Expected: no content changes; renames only.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: move the harness from .aidlc/ to .claude/harness/

Claude Code is the only target runtime, so the agent-neutral core and its
adapter indirection stop earning their cost. Historical artifact prose keeps
its .aidlc references: those files record what was true when each change
shipped, and governingPlans reads only the current change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rewrite the docs and eval prose

Separable from Task 1: a reviewer can accept the code move and reject the prose, or the reverse. Step 5 of Task 1 already rewrote these mechanically; this task is the human read-through.

**Files:**
- Modify: `docs/*.md` (12 files, 234 occurrences), `evals/**` (43 files, 571), `README.md` (37), `.github/workflows/harness.yml` (34)

**Interfaces:**
- Consumes: the `.claude/harness/` paths established in Task 1.

- [ ] **Step 1: Find prose that says more than a path**

```bash
git grep -n -i 'agent-neutral\|provider director\|projection.*only\|AIDLC harness under' -- docs README.md .claude-plugin
```

Each hit asserts the neutrality that this change retires. Rewrite the sentence, do not just repoint the path.

- [ ] **Step 2: Verify the CI workflow's five `HARNESS_HOME` values**

```bash
grep -n 'HARNESS_HOME' .github/workflows/harness.yml
```

Expected: the five that pointed at `${{ github.workspace }}/.aidlc` now read `${{ github.workspace }}/.claude/harness`; the two bare `${{ github.workspace }}` values are unchanged.

- [ ] **Step 3: Confirm no stale references remain**

```bash
git grep -c '\.aidlc' -- docs evals README.md .github ':!docs/superpowers'
```

Expected: no output (exit 1, no matches).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: repoint prose at .claude/harness/ and retire the neutrality claim

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rebuild the example installs

The two example projects carry generated shims and identity pins that are stale by construction. They are regenerated, never rewritten.

**Files:**
- Delete: `examples/scratch-py/.aidlc/`, `examples/scratch-py/.claude/`, `examples/scratch-ts/.aidlc/`, `examples/scratch-ts/.claude/`
- Create: the `.claude/harness/` equivalents, via `harness init`

**Interfaces:**
- Consumes: `.claude/harness/bin/harness init --into <dir>` from Task 1.

- [ ] **Step 1: Remove the old installs**

```bash
rm -rf examples/scratch-py/.aidlc examples/scratch-py/.claude \
       examples/scratch-ts/.aidlc examples/scratch-ts/.claude
```

- [ ] **Step 2: Re-init both**

```bash
node .claude/harness/bin/harness init --into examples/scratch-py
node .claude/harness/bin/harness init --into examples/scratch-ts
```

- [ ] **Step 3: Verify the identity pins**

```bash
node -e '
for (const p of ["examples/scratch-py", "examples/scratch-ts"]) {
  const f = p + "/.claude/harness/harness-install.json";
  const m = JSON.parse(require("fs").readFileSync(f)).identity.manifest;
  const bad = m.entries.filter(e => !/^\.claude\/harness\/|^\.claude-plugin/.test(e.path));
  const ghosts = m.entries.filter(e => /skills\/map\/SKILL\.md|sensors\/test-quality\.mjs/.test(e.path));
  console.log(p, "entries", m.entries.length, "| bad", bad.length, "| ghosts", ghosts.length);
  if (bad.length || ghosts.length) process.exit(1);
}'
```

Expected: `bad 0 | ghosts 0` for both. The `map/SKILL.md` and `test-quality.mjs` ghosts were stale in the old pin; this is where they are corrected.

- [ ] **Step 4: Confirm the generated shim carries the new roots**

```bash
grep -c '\.claude/harness/bin' examples/scratch-ts/.claude/harness/bin/harness
grep -c '\.aidlc' examples/scratch-ts/.claude/harness/bin/harness
```

Expected: a non-zero first count, and `0` for the second.

- [ ] **Step 5: Run the full suite**

```bash
node --test test/*.test.mjs 2>&1 | tail -10
```

Expected: `pass 627, fail 0, skipped 1`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: regenerate the example installs against .claude/harness/

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Regenerate the projections

**Files:**
- Regenerate: root `CLAUDE.md`, `.claude/settings.json`, `CODEBASE-MAP.md`, `.claude/harness/hooks.json`

**Interfaces:**
- Consumes: `harness init --into . --force` and `harness map` from Task 1.

- [ ] **Step 1: Regenerate the source-repo projections**

```bash
node .claude/harness/bin/harness init --into . --force
node .claude/harness/bin/harness map
```

- [ ] **Step 2: Confirm the plugin is still disabled here**

```bash
node -e 'const s=require("./.claude/settings.json");
console.log(JSON.stringify(s.enabledPlugins));
if (Object.values(s.enabledPlugins)[0] !== false) { console.error("plugin re-enabled"); process.exit(1); }'
```

Expected: `{"lean-harness-cs-v1@lean-harness-cs-v1":false}`. `bin/harness:101` is the self-init path and returns `false`; this step proves it took that path.

- [ ] **Step 3: Confirm the generated permissions moved**

```bash
grep -n 'harness/artifacts\|harness/bin' .claude/settings.json
```

Expected: all four allow entries naming `.claude/harness/`.

- [ ] **Step 4: Confirm the hooks projection landed and the adapter is gone**

```bash
test -f .claude/harness/hooks.json && ! test -d .claude/harness/adapters && echo ok
grep -n 'CLAUDE_PLUGIN_ROOT' .claude/harness/hooks.json
```

Expected: `ok`, and four commands reading `${CLAUDE_PLUGIN_ROOT}/.claude/harness/bin/harness`.

- [ ] **Step 5: Confirm `.claude/skills/` and `.claude/agents/` were not created**

```bash
ls -d .claude/skills .claude/agents 2>/dev/null || echo "absent — correct"
```

- [ ] **Step 6: Run the full suite and commit**

```bash
node --test test/*.test.mjs 2>&1 | tail -10
git add -A
git commit -m "$(cat <<'EOF'
chore: regenerate CLAUDE.md, settings, map and the hooks projection

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Land it as one commit and verify against HEAD

The identity manifest compares the working tree to `git ls-tree HEAD`, so the harness's own checks can only be run after the move is committed on `main`.

**Files:** none modified; this task is the merge and the acceptance run.

- [ ] **Step 1: Squash the branch onto `main`**

```bash
git checkout main
git merge --squash move-harness-to-claude
git commit -m "$(cat <<'EOF'
refactor: move the harness from .aidlc/ to .claude/harness/

Claude Code becomes the only target runtime. The agent-neutral core and its
adapter indirection are retired; .claude/harness/ is the single home, leaving
.claude/skills/ and .claude/agents/ free for the user's own.

Hard cut: no migrate command, no .aidlc fallback, and the untracked local
state and eval output are not carried over. Historical artifact prose keeps
its .aidlc references — governingPlans reads only the current change, so
those 6,371 occurrences are inert and describe paths that were real when
each change shipped.

Implements docs/superpowers/specs/2026-09-18-aidlc-to-claude-design.md

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Acceptance criteria 1 and 2**

```bash
git grep -c '\.aidlc' -- . ':!.claude/harness/artifacts' ':!docs/superpowers' ':!test/layout.test.mjs' || echo "criterion 1: zero — pass"
echo "artifact files: $(git grep -l '\.aidlc' -- .claude/harness/artifacts | wc -l) (expect 238)"
echo "artifact occurrences: $(git grep -o '\.aidlc' -- .claude/harness/artifacts | wc -l) (expect 6371)"
```

- [ ] **Step 3: Acceptance criterion 3 — history survived the rename**

```bash
git log --follow --oneline -- .claude/harness/lib/paths.mjs | wc -l
```

Expected: more than one commit. A count of 1 means the rename was recorded as a delete-plus-add and history was lost.

- [ ] **Step 4: Acceptance criterion 4 — the suite**

```bash
node --test test/*.test.mjs 2>&1 | tail -10
```

Expected: `tests 628, pass 627, fail 0, skipped 1`.

- [ ] **Step 5: Acceptance criterion 5 — the harness verifies itself**

```bash
node .claude/harness/bin/harness doctor --json
node .claude/harness/bin/harness check --stage commit
```

Expected: both pass. This is the step that could not run before the commit. If `doctor` reports an identity mismatch, the working tree diverges from `HEAD` — commit the remainder and re-run rather than editing the manifest.

- [ ] **Step 6: Acceptance criteria 6, 7 and 8**

Re-run Task 3 Step 3 (identity pins), Task 4 Step 5 (`.claude/skills` and `.claude/agents` absent), and Task 4 Step 2 (plugin disabled) against the merged tree.

- [ ] **Step 7: Delete the branch**

```bash
git branch -d move-harness-to-claude
```

## Rollback

Every task is a commit on a branch, and `main` is untouched until Task 5. To abandon: `git checkout main && git branch -D move-harness-to-claude`. After Task 5, `git revert` the squash commit restores `.aidlc/` for tracked files; the untracked `state/` and `evals/` directories are not recoverable, which is the accepted cost of the hard cut.
