---
status: draft
---
# Review: a-shell-redirect-is-a-write

Independent evaluator (Opus 5, read-only: Read/Grep/Glob), base `81f3a0d` → candidate `4968d55`.

`harness review` was attempted first and failed with `spawnSync claude ETIMEDOUT` at a 900,000 ms
timeout; the CLI itself answered a trivial prompt in 2.5 s, so the timeout was the review workload,
not the invocation. The evaluator role was then run in-session against the same two commits. Its
report arrived in three parts because each response was truncated; the content below is assembled
from all three and is otherwise verbatim in substance.

The three Important findings were reproduced independently by the caller against
`evals/fixtures/contract-planned` before any action was taken on them.

## Findings

| Severity | Cites | Finding |
|---|---|---|
| Important | B4, B3 (spirit) | **New false blocks on read-only commands and out-of-tree writes.** `.aidlc/lib/guard.mjs:223` resolves every extracted token against `cfg.layout.root`, so any token that is not a real repo path is treated as one and refused. Under the base commit all returned `null`. `grep -rn "sed -i" --exclude-dir=.git . 2>/dev/null` is refused naming `2>/dev/null` — a read-only grep, refused because its quoted search pattern contains the word `sed`. This is the defect `p0-unblock-the-loop` fixed and that `test/guard.test.mjs:44` records as "a guard that blocks reading is one people learn to route around". `echo x > ~/notes.txt` is refused because `~` is expanded by the shell, not `path.resolve`, so it lands inside the root; same for `$LOGFILE`. `cat x \| tee "my notes.txt"` is refused naming `my`. The evaluator hit the first case live before probing: its own read-only `grep` was denied. |
| Important | B2, B3 | **A file the approved plan owns cannot be edited in place through the shell.** `sed -i '' 's/a/b/' src/app/text.py` — an owned path — is refused naming `s/a/b`. `writeTargets` (`guard.mjs:170-172`) pushes all non-flag args for `sed -i`, so the script fragment is a target and is checked before the real file. B2 says an owned path "is honoured through the shell exactly as it is through Write and Edit"; for the commonest in-place shell edit it is not. B3 is literally satisfied — `writeTargets` is byte-for-byte unchanged — but false in effect: the set of extracted tokens that *matter* went from none-when-a-plan-is-approved to all of them. |
| Important | B1, B2, B3 | **The suite cannot see either finding above.** `test/guard.test.mjs:212-224` asserts only `assert.ok(bashContractBlocked(cmd, cfg))` — truthiness, not which target. Its own row `"sed -i '' s/a/b/ src/app.py"` passes today while refusing `s/a/b` rather than `src/app.py`. The new B1 table (`test/guard.test.mjs:326-333`) asserts `Boolean(bash) === Boolean(write)` and never compares messages, so B1's clause "the refusal is the same message the Write tool returns" is unasserted. The table is otherwise real proof and the old blind spot is closed; a new one of the same shape is open. |
| Minor | B1 | **`require_contract = false` still leaves the two paths disagreeing.** `bashContractRefusal` early-returns at `guard.mjs:197`; `writeRefusal` applies prefix-cache, protected-path and test-lock *before* its `require_contract` block (`guard.mjs:69-95`). With the guard off, a shell write to a protected or test-locked path is allowed and the same write through Write/Edit is refused. `preBash`'s fallback (`dispatch.mjs:96`) covers only `PREFIX_CACHE_PATHS`, which excludes `.aidlc/harness.toml`. Inside the approved boundary, since the Design deliberately preserves the early return — but the Outcome sentence and `CLAUDE.md` both claim something broader than what holds. |
| Minor | B1 | **Carve-out ordering differs between the paths.** Bash drops `/dev/` and `artifactOrState` targets before asking (`guard.mjs:227`); `writeRefusal` applies prefix-cache, protected-path and test-lock before its `artifactOrState` check. A target both under `.aidlc/artifacts/` and protected or test-locked is allowed through Bash and refused through Write. Not reachable with this repository's config; reachable in any project protecting a path under those trees. |
| Minor | B1, B4 | **The `/dev/` filter is dead code whenever `cfg.layout.root` is set** (`guard.mjs:227`). After `path.relative` on line 223, `/dev/null` normalises to a `..`-prefixed path and is consumed by the `..` filter on line 226. Behaviour is correct and the B1 `/dev/` row still passes, but for a different reason than the code claims, and the spec's statement that the carve-outs "remain visible at the call site" is no longer true of a live branch. |
| Minor | B1 | **Fail-closed is preserved; the removed `catch` was largely dead.** `contractScopeState` has its own try/catch returning `{parseError: true, declared: []}` rather than throwing, so the base commit's catch was almost unreachable. That state now routes through `writeRefusal:99` and still refuses, with the identical message the Write path gives — which is what B1 asks for. Narrow loss: a genuine throw (absent `cfg.layout`) now escapes into dispatch's outer handler, which fails open but records. The Write path has the identical exposure, so this is consistent rather than newly divergent. |

## Verified clean

- B5: `dispatch.mjs:94` passes `hit.rule`; `writeRefusal` returns only B5's four ids.
- No rule registry to update; `contract-scope` survives only as the eval id `contract-scope-honesty`.
- B6: `test/scope-drift.test.mjs` is not in the diff.
- `writeTargets` byte-for-byte unchanged — extraction was not widened.
- `## Files` honoured exactly; `CODEBASE-MAP.md` regenerated, not hand-edited.
- The string-form wrapper is justified: `test/worktree-selection.test.mjs:9,67` imports `bashContractBlocked`.
- The B1 fixture is non-vacuous: `evals/lib/stage.mjs` selects `hyphen-titlecase`, and the protected row anchors `require_contract`.
- Multi-target proof is real: `writeTargets` emits in source order (`test/guard.test.mjs:365`).

## Evidence and uncertainty

- **The evaluator ran no tests.** No `harness check` at any stage; it took the caller's word that checks were green.
- Read-only throughout: nothing edited, committed or changed.
- Read: the full diff, `guard.mjs`, `dispatch.mjs`, `paths.mjs`, `config.mjs`, `harness.toml [guard]`, the spec, the plan, D1, `CLAUDE.md`, the fixture and `stage.mjs`.
- Two read-only probes importing the candidate's modules produced the quoted refusals. The first piece of evidence was unplanned: the live guard refused a `grep` the evaluator itself issued.
- Base-commit behaviour is reasoned from the two-line base code in the diff, not executed against a checked-out base.
- Not verified by the evaluator: the plan's promised by-hand runtime re-probe, and any effect on the `contract-scope-honesty` eval.

**Checks, run separately by the caller and not claimed by this review:** `--stage stop` PASS
(`secrets` 78 ms, `test` 65,929 ms) and `--stage commit` PASS on all eight controls. The plan's
runtime re-probe was performed and all five targets agreed across both paths; it is recorded here
because the evaluator correctly noted it was not yet written down anywhere.

## Recommendation

**changes-requested** — the normalisation re-opens read-blocking, breaks B4 for `~` and `$VAR`
targets, and blocks `sed -i` on an owned file, none of which the suite can detect.

---

# Review round 2: `4968d55` → `5c35a98`

The repair for round 1's three Important findings. Same evaluator, same read-only constraint.
Every finding below was reproduced independently by the caller on `contract-planned` before being
accepted.

## Findings

| Severity | Cites | Finding |
|---|---|---|
| Miss shape (the question asked) | B3 | **`isPathLikeToken` drops four families of real write target**, all refused at `4968d55` and allowed now: variable-bearing paths (`echo x > "$PWD/src/app/handlers.py"`, `cp /tmp/x "$REPO/…"`), command substitution (`` echo x > `pwd`/… ``), globs (any target containing `*`), and any path containing a space (`tee "src/app/my notes.md"` — both split fragments dropped). **Size:** bounded to writes whose destination is *computed* rather than literal; every literal in-repo path still refuses, and `scope-drift` still catches all four at commit. This is the trade `guard.mjs` already states — "a write may slip through, a read is never blocked". Accepted, not a defect. |
| Minor | B2, B3 | **Residual `sed` false block, narrowed but not closed.** `^s/` is script-syntax-specific, so on an **owned** file `sed -i '' '1d' src/app/text.py` is refused naming `1d`, and `sed -i '' 'y/ab/cd/' …` naming `y/ab/cd`. (`'/foo/d'` is fine — absolute-looking, so out-of-tree.) The same B2 shape as round 1, over a smaller family. `.aidlc/lib/guard.mjs:220`. |
| Minor | B3 | **Flag *values* are still path-like.** `truncate -s 0 src/app/*.py` is refused naming `0`, while the real target is dropped by the `*` rule — a false block and a miss in one command. `dd bs=4k of=…` has the same shape. Origin is `writeTargets`' argument split, which is out of scope; this filter surfaced it. |
| Nit | spec Design | **The carve-out-ordering justification holds.** The Design's "`artifactOrState`, `/dev/` and quoted-then-empty targets are filtered before the question is asked, not inside the answer" explicitly approves the bash-side call-site filtering, so the round-1 ordering mismatch is spec-sanctioned rather than a deviation. One inconsistency: that sentence names `/dev/` as a visible call-site carve-out and this diff deletes it (`guard.mjs:265`). Behaviour-preserving — the `..` filter subsumes it and the replacement comment says so — but the spec sentence is now one filter out of date. |
| Verified | B1, B4 | Parity is `assert.equal(bash, write)` — message equality, not truthiness. The unowned table anchors each refusal to the real file with `^<path>:`. `~` expansion fixes B4. `writeTargets` still byte-for-byte unchanged. Round 1's four false blocks are asserted allowed **by a test**, not merely observed. |

## Evidence and uncertainty

- **The evaluator ran no tests** at either round, and no `harness check` at any stage. It took the caller's word that the stages are green.
- Read-only throughout: nothing edited or committed.
- It read the full `4968d55..5c35a98` diff and re-probed the candidate's modules against `contract-planned` staged into a temp directory; every verdict it quotes is from that probe.
- Base-commit comparisons are reasoned from the round-1 code, not executed against a checked-out base.
- Not verified by the evaluator: the full suite, and whether the `contract-scope-honesty` eval shifts.

**Checks, run separately by the caller:** `--stage stop` PASS (`secrets` 82 ms, `test` 69,563 ms),
run by the caller on `5c35a98`; `--stage commit` PASS on all eight controls, run by the generator.
The caller independently re-ran 16 behavioural assertions on `contract-planned` — the four round-1
false blocks now allowed, five unowned-write shapes still refused and each naming the real file,
owned writes proceeding, and message equality across owned, unowned and artifact targets — and
separately reproduced every residual finding in the table above.

## Recommendation

**approve** — the three Important findings are genuinely closed with tests that lock them, and the
residual `sed`/flag-value false blocks and computed-path misses are small, bounded, and better
recorded as a follow-up defect than held against this repair.

## Carried forward, not fixed here

1. `writeTargets` argument extraction is the origin of both residual families: it splits on
   whitespace without regard to quoting, and treats every non-flag argument of `sed`, `truncate`
   and `dd` as a destination. Repairing it is a separate change with its own gate.
2. The `require_contract = false` divergence between the two paths (round 1, Minor), which the
   approved Design deliberately preserves.
3. The Design sentence naming `/dev/` as a live call-site carve-out is now one filter out of date.
