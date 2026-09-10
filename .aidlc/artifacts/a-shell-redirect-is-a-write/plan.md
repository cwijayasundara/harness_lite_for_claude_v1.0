---
status: approved
spec_digest: sha256:caac2fb92238b930dc0b984f8553a93c12d9c92b0659cfdd4e06a93a94e7a854
spec_approval_digest: sha256:66bc44d4d1f3970ef0907db80f597de14b2b8bd3cdb38ae24a4083ddbf22f161
by: cwijayasundara
at: 2026-09-10T13:35:27.193Z
digest: sha256:06258b4beb5d7cea1bd710ffb0bd85741541778e85644bad0d95c1690571fa56
approval_version: 2
approval_digest: sha256:d6121f05434bd414c2fee3e91153e5f554a36313439a435b6b34dcd2156f4932
---
# Plan: a-shell-redirect-is-a-write

## Approach

`bashContractBlocked` stops answering the ownership question and starts asking it. The extraction
stays exactly where it is; only the verdict moves, from a local test of whether *any* change is
selected to `writeRefusal`, which is already the one implementation of what `## Files` means.

The shape follows the split guard.mjs already uses. `bashContractRefusal(cmd, cfg)` is the named
form returning `{ rule, message }`; `bashContractBlocked(cmd, cfg)` keeps returning the string and
becomes a one-line wrapper over it. That is deliberate rather than tidy: `test/guard.test.mjs` and
`test/worktree-selection.test.mjs` both import `bashContractBlocked` and assert on strings, and
`test/worktree-selection.test.mjs` is not a file this change owns. `writeRefusal` and
`writeBlocked` were split for this exact reason and the comment above them records it.

Normalisation is the second half of the repair, and it is the half that is easy to miss. The two
paths must not merely consult the same function, they must hand it the same string. `preWrite` in
`dispatch.mjs` computes `path.relative(root, path.resolve(root, file))`; the bash path today strips
a root prefix by string comparison and leaves an out-of-tree absolute path untouched, which is why
the two disagree in *both* directions rather than one. Using the same computation on both sides is
what makes B1 and B4 the same fix rather than two.

The alternative considered and rejected: keep `bashContractBlocked` self-contained and add a
`matchesDeclared` call to it. It is three lines shorter and it recreates the defect — two readers
of ownership is how the guard and the check came to disagree in the first place, which the comment
at the top of `contractScopeState` already says about a previous instance.

The `require_contract` early return stays. A repository with the contract guard off sees no
change, and `scope guard remains configurable for non-product repositories` keeps proving it.

## Files

- `.aidlc/lib/guard.mjs`
- `.aidlc/hooks/dispatch.mjs`
- `test/guard.test.mjs`
- `CODEBASE-MAP.md`

## Order

1. `test/guard.test.mjs` — the failing test first. A table-driven case on the `contract-planned`
   fixture, where `hyphen-titlecase` owns `src/app/text.py`: for each of an owned path, an unowned
   path, a `protected_paths` path, an `.aidlc/artifacts/` path and a `/dev/null` target, assert
   `bashContractBlocked('echo x > <target>', cfg)` and `writeBlocked('<target>', cfg)` agree. This
   must fail on the unowned and protected rows before anything else is touched; the failure output
   is pasted into `review.md` as the reproduction.

2. `.aidlc/lib/guard.mjs` — `bashContractRefusal`. Keep the `require_contract` early return and
   `writeTargets` untouched. Replace the per-target mapping with the `preWrite` computation, drop
   targets that resolve outside the root, keep the `/dev/`, `artifactOrState` and empty-after-quotes
   filters where they are, then return the first `writeRefusal` hit across the surviving targets.
   `bashContractBlocked` becomes `bashContractRefusal(...)?.message ?? null`. Step 1 goes green.

3. `test/guard.test.mjs` — B4 and the multi-target rule. An absolute path under `tmpdir()` and a
   `../outside.txt` escape are allowed on both paths; a command writing one owned and one unowned
   target is refused and the message names the unowned one, not the first extracted.

4. `test/guard.test.mjs` — B2's positive case, which no test asserts today: with a plan selected,
   `echo x > src/app/text.py` proceeds. The suite currently only proves the bash guard refuses when
   nothing is approved, which is precisely the blind spot that let D1 live.

5. `.aidlc/hooks/dispatch.mjs` — `preBash` calls `bashContractRefusal` and passes `hit.rule` to
   `fired` in place of the literal `'contract-scope'`.

6. `test/guard.test.mjs` — B5. Drive the real hook with the `dispatch('pre-bash')` harness already
   in this file at lines 106 and 443, and assert the appended ledger row's `rule` is `write-scope`
   for an unowned target and `protected-path` for a fixture path, rather than one label for both.

7. `CODEBASE-MAP.md` — regenerate with `harness map` once the exports settle.

8. `--stage commit`, run and pasted. `test/scope-drift.test.mjs` is not edited; it passing
   unchanged is B6's proof, and editing it would destroy the evidence it provides.

Steps 1–2 are the repair. 3–6 complete the behaviours. 7–8 close it.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | new `test/guard.test.mjs::the bash path and the write path return one verdict for one target` — table-driven over owned, unowned, protected, artifact and `/dev/` targets on the `contract-planned` fixture; asserted failing at step 1 before it is made to pass |
| B2 | the owned row of that table, plus a new positive case that `echo x > src/app/text.py` proceeds under a selected plan; existing `test/guard.test.mjs::the contract guard does not block a command that writes no product file` keeps the `.aidlc/artifacts/` and `.aidlc/state/` cases |
| B3 | existing `test/guard.test.mjs::the contract guard does not block a command that writes no product file` and `::a redirection is a redirection, not every angle bracket`, both unchanged — the second is the assertion that extraction did not widen |
| B4 | new case in the same table: an absolute `tmpdir()` target and a `../outside.txt` escape are allowed on both paths |
| B5 | new case driving `dispatch('pre-bash')` and reading the appended ledger row: `rule` is `write-scope` for an unowned target and `protected-path` for a fixture path |
| B6 | `test/scope-drift.test.mjs` passing unchanged, in particular `::the approved plan owns the working diff` and `::only the current change's plan owns the working diff; an older plan's file is a finding` |

Runtime proof beyond the suite: the guard is re-probed by hand after step 2 against the real
configuration with a plan selected, reproducing the intent's five-row table and showing both
columns agreeing where they disagreed. That table is what this change claims to fix, and a unit
test on a fixture is not by itself evidence that the fix reached the running configuration.
