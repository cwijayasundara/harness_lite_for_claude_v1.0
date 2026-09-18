# Independent review

Base: 42df7485f8602a019a960e831666115447b63f00
Candidate: 716db71c905b1dea18a3c90bd9f11839da8e737c
Model: claude-opus-5
Cost USD: 1.7095585000000002
Checks: run separately; not claimed by this review.

# Review: `the-index-tracks-the-source`

Base `42df748` → candidate `716db71`. Read-only review of `candidate.diff` and the `candidate/` snapshot against `.aidlc/artifacts/the-index-tracks-the-source/{spec,plan}.md` and `.aidlc/policies/review.md`.

## Controls overridden by this diff

No `# noqa`, no suppression, no tolerance change. `tolerance` stays `1.1`. Every movement in `.aidlc/baseline.json` is downward or flat, so no ratchet was loosened:

| metric | was | is | in `RATCHETED`? |
|---|---|---|---|
| `check_stop_tokens` | 1888 | 12 | **yes** (`.aidlc/lib/baseline.mjs:21`) |
| `pack_tokens_p50` | 1186 | 1175 | yes |
| `session_context_tokens` | 649 | 648 | yes |
| `graph_modules` | 543 | 99 | no |
| `graph_symbols` | 1650 | 593 | no |

The spec's safeguard claim (`spec.md:116`, "Neither metric is in `RATCHETED`") is **verified correct** against `.aidlc/lib/baseline.mjs:20-22` — `graph_modules` and `graph_symbols` are not graded, so the scope correction cannot be read as a rise. That is the right call and it is documented. The one movement that needs an answer is `check_stop_tokens`; see Important 1.

## Blocking

**1. The B2 "no git" test cannot fail, and stands in for an approved safeguard.** — cites B2, Compliance pass

`test/graph.test.mjs:171-175`:

```js
test('B2 — a directory with no git still fingerprints rather than throwing', () => {
  const s = stage(FIXTURES, 'graph-app');
  ...
  assert.equal(typeof fingerprint(cfg), 'string', 'no git degrades to a value, not an error');
```

`stage()` git-initialises and commits every fixture before returning (`evals/lib/stage.mjs:42-47`: `git('init','-q')` … `git('-c','commit.gpgsign=false','commit','-qm','fixture')`). `s.work` is therefore a git repository with a commit, `headCommit()` (`.aidlc/lib/graph.mjs:515-519`) succeeds and returns a sha, and the `catch { return ''; }` branch is never entered. The assertion is also true at base — `fingerprint()` returned a string before this change — so it could not have been "written failing at step 4" and cannot regress.

Spec B2 and `spec.md:111-112` claim degradation on "no git, no commit, or a shallow clone"; `plan.md:71` books this test as the proof of it. All three degradation paths are unproven. The `try/catch` makes the no-git and no-commit cases plausibly correct by inspection, but nothing in the suite holds them.

Fix: exercise the path against a directory that is genuinely not a repository (e.g. a bare `mkdtempSync` outside any repo), and assert the *fingerprint value* equals what a run with an empty commit component would produce, not merely its type.

## Important

**1. `check_stop_tokens` = 12 is a ratcheted reference whose stated validity condition is not the condition the gate evaluates it under.** — cites Compliance pass; `plan.md:29`

`plan.md:29` declares the recapture moves "`graph_modules`, `graph_symbols` and `pack_tokens_p50`". `check_stop_tokens` 1888 → 12 is not declared there and is justified only in prose (`docs/IMPROVEMENT-PLAN.md`, diff:182-191) as a correction to a different change's record. The record itself concedes the constraint: "`check_stop_tokens` is only meaningful when captured on a clean tree."

But the metric is graded live at commit stage: `harness.toml:27` puts `baseline` in `commit`; `.aidlc/checks/baseline.mjs:22` calls `baseline.capture(cfg)` fresh; `capture()` re-runs the `stop` stage internally (`.aidlc/lib/baseline.mjs:40`). A commit-stage run happens by construction on a tree that is not yet committed. At `12` with tolerance `1.10`, the entire rendered `stop` output must be ≤ 13 tokens — and `render()` (`.aidlc/lib/runner.mjs:203-221`) emits one line per control, three more lines whenever `report.ok` is false, and one line per finding.

The existing escape hatch does not cover this: `ENVIRONMENT_SENSITIVE` contains `check_stop_tokens` (`.aidlc/lib/baseline.mjs:80`) but `compare()` only applies the skip when `errored_controls` *differ* (`:92`) — a control that **fails** rather than **errors** does not trigger it. The change writes the clean-tree property into a doc comment instead of into that guard.

I could not run `harness baseline capture`, so I cannot state whether the commit stage is red today. What is verifiable is that the reference value and the evaluation condition are documented as incompatible and nothing detects the mismatch.

**2. Spec B2's actual Then clause — `refresh()` does not report `clean` — is never asserted.** — cites B2

Spec B2: "When `refresh()` runs, Then it does not report `clean`". `plan.md:71` repeats it: "`refresh()` does not report `clean` across it". The new test (`test/graph.test.mjs:153-169`) compares two `fingerprint()` values and never imports or calls `refresh`.

The behaviour does appear sound by inspection — `refresh.mjs:53-54` sets `previous = graph.load(cfg)`, and `load()` (`graph.mjs:479`) returns `null` on a fingerprint mismatch, so the `skipped: 'clean'` branch is unreachable across a commit. But the approved behaviour is stated at the `refresh()` boundary and is proven one layer below it, at a private helper.

**3. B3's `pack` miss-path obligation is unmet, and it is the safeguard for B1's blast radius.** — cites B3, B1, Compliance pass

Spec B3 requires "`pack.mjs` and the pre-search hook take their existing miss paths and send the caller to search". `spec.md:105-107` makes this the safeguard that stops 451 removed modules from becoming confident "not found" answers. `plan.md:72` books it explicitly: "`pack` on a symbol in an unindexed path returns a miss that names search rather than reporting absence."

`test/graph.test.mjs:181-207` asserts only that `load()` returns `null` after a tree change and that `audit.ambiguous` / import edges name modules present in the same build. It imports nothing from `pack.mjs` and does not touch the pre-search hook. By inspection `renderPack()` (`.aidlc/lib/pack.mjs:80-83`) does emit `no graph entry for "…" … fall back to: grep -rn`, so the safeguard is likely intact — but the one behaviour that bounds the damage of removing 82% of the index has no assertion behind it.

**4. The new B2 test omits the gpgsign guard the staging helper carries.** — cites Bugs pass, B2

`test/graph.test.mjs:157-165` builds its own git helper:

```js
const git = (...args) => spawnSync('git', args, { cwd: s.work, encoding: 'utf8' });
...
git('commit', '-q', '--allow-empty', '-m', 'a commit that changes no file');
```

`evals/lib/stage.mjs:47` deliberately passes `-c commit.gpgsign=false` for its own commit. The new test does not. On a machine with `commit.gpgsign=true` in global config, the `--allow-empty` commit fails, `after === before`, and the test fails with "history moved, so the index must be rebuilt" — a message pointing at the production code rather than at the environment. No `spawnSync` status is checked anywhere in the block, so a failed git call is silent until the assertion.

## Nits (5; no others withheld)

1. `HARNESS_OUTPUT = ['.aidlc/evals', '.claude/worktrees']` (`.aidlc/lib/graph.mjs:51`) is a second copy of a list that already exists at `test/install.test.mjs:285`, which additionally names `.aidlc/state` and `.claude/state`. No indexable file lives in either today, so nothing breaks — but `graph.mjs:315` calls two lists that must agree "the shape of most defects in this repository," and this change adds one.
2. `spec.md:67` places the union "inside `discover()`"; the code applies it in `walk()` (`.aidlc/lib/graph.mjs:64`). Equivalent for every current caller, but `build(cfg, { only })` (`graph.mjs:230`) bypasses `discover`/`walk` entirely, so an incremental path would not inherit the exclusion. `only` has no caller anywhere in the tree, so this is latent, not live.
3. "shallow clone" in the `why:` comment (`.aidlc/lib/graph.mjs:509`) and `spec.md:112` is inaccurate — `git rev-parse HEAD` resolves normally in a shallow clone and returns a sha; only no-git and no-commit reach the empty component.
4. `test/graph.test.mjs:182` pulls `save, load` via `await import('../.aidlc/lib/graph.mjs')` while `build, query, fingerprint` are statically imported at the top of the same file. Same module, two import styles, no reason given.
5. `test/graph.test.mjs:162` (`git('commit','-q','-m','first')`) is dead: `stage()` already committed the tree, so `git add -A` stages nothing and this commit exits non-zero and is discarded. Also, the B3 test is named "a rank never outlives the modules it ranks" but never queries `hubs` or any rank.

## Verified without finding

- `execFileSync` is imported at `.aidlc/lib/graph.mjs:15`, so `headCommit()` does not silently swallow a `ReferenceError` into the empty-component path.
- `refresh()`'s coalescing, TTL lock and fail-open behaviour are untouched, as `spec.md:96-97` requires.
- `.aidlc/artifacts/**` remains indexed (`isHarnessOutput` matches `.aidlc/evals` only), matching B1 and asserted at `test/graph.test.mjs:130,140`.
- A project's own `exclude` is unioned, not replaced (`graph.mjs:60` and `:64` are independent `continue`s), asserted at `test/graph.test.mjs:141`.
- `evals/fixtures` (a `[guard] protected_paths` entry, `harness.toml:87`) is not modified by the diff.

## Evidence and uncertainty

**No tests were run by this reviewer.** This review has Read/Grep/Glob only and no shell; every statement above is from reading `candidate.diff` and the `candidate/` snapshot at `716db71`.

Unverified:
- The measured table in `docs/IMPROVEMENT-PLAN.md` (543→99 modules, 1650→593 symbols, 282→55 ambiguous, 620.1→173.9 KB, 853→62 ms) is a recorded host observation with no executed-proof artifact in-tree. `plan.md` steps 3 and 7 required these measurements and they are recorded; step 10 required pasting `harness check --stage commit` output, and no such record accompanies the change. Per `.aidlc/policies/review.md`, archived host observations do not prove correctness, and I did not reproduce any of these numbers. Unlike sibling changes (`every-control-fires-or-goes/evidence.md`, `team-reuse/evidence.md`), this change ships no `evidence.md`.
- Whether the commit stage currently passes with `check_stop_tokens: 12`. Important 1 is a structural argument from `baseline.mjs`, `checks/baseline.mjs` and `runner.mjs:203-221`, not an observed failure.
- Whether `git rev-parse HEAD` with `cwd: root` can resolve an *enclosing* repository's HEAD for a project directory that is not itself a repo. That would tie the index's identity to unrelated history. Consequence is bounded — a fingerprint mismatch is a miss, never a wrong answer (`graph.mjs:479`) — so the worst case is spurious rebuilds, and after B1 a rebuild is cheap. I did not test it and am not filing it as a finding.
- Performance: `refresh()` calls `fingerprint()` twice per invocation (`refresh.mjs:53` via `load()`, then `:54` directly), so this change adds two `git` subprocess spawns per refresh. Pre-existing double work; I have no measurement of the added cost.

`CODEBASE-MAP.md` is generated (`<!-- Generated by harness map; do not edit -->`) and was not reviewed, per `.aidlc/policies/review.md`.

## Recommendation

**changes-requested** — the B2 no-git assertion cannot fail and cannot have failed before the change, so an approved safeguard has proof in name only; three further approved proof obligations (B2's `refresh()` clause, B3's `pack` miss path) are unmet, and an undeclared 157× tightening of a ratcheted metric ships with its own validity condition documented as unmet by the gate that grades it.

The production code in `.aidlc/lib/graph.mjs` reads correct to me on both behaviours. Every Blocking and Important item above is about proof or about the baseline recapture, not about the two changed functions — so the repair should be small and should not need a second round.
