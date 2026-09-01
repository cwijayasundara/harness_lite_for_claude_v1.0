# Review: p0-unblock-the-loop

- **Date:** 2026-09-01
- **Contract:** [.aidlc/artifacts/contracts/p0-unblock-the-loop.md](../contracts/p0-unblock-the-loop.md)
- **Status:** draft <!-- draft | approved | changes-requested  (HUMAN GATE 3) -->
- **Reviewer:** Claude Opus 5 (agent pass) — human approval outstanding
- **Commit:** fa422ff, plus the review fix below

## Verification

```
$ node .aidlc/bin/harness check --stage commit
PASS  secrets     51ms
PASS  test        8579ms
PASS  scope-drift 77ms
PASS  budget      1ms
```

CI run URL: not yet — this branch has not been pushed. `ci-runs-without-a-key` (P1) is the
reason the workflow cannot currently grade a branch, and it is the next item.

Note on the `test` figure: 8.6s across 24 files. Before this change `secrets` failed in 48ms and
`fail_fast` skipped the suite entirely, so the number that mattered here was not a slower test
run but the first one in days that ran at all.

## Behaviour coverage

| Contract behaviour | Implemented | Evidence |
|---|---|---|
| B1 — a descriptor redirect is not a write | yes | `test/guard.test.mjs :: the contract guard does not block a command that writes no product file`; live `echo hi 2>/dev/null`, `harness check --stage stop 2>&1 \| tail`, and commit fa422ff's `<noreply@…>` trailer all previously refused |
| B2 — a product-file redirect is still blocked | yes | `test/guard.test.mjs :: the contract guard still blocks an unowned write to a product file`; live, scope-drift refused `test/unit.test.mjs` until the contract was widened |
| B3 — `--stage stop` runs the suite | yes | check output above; `test/gauntlet.test.mjs` Phase 4 still asserts `hardening` detects `security-defective` on all three stacks |
| B4 — a session is a run | yes | `test/unit.test.mjs :: a new session rotates the run id, and HARNESS_RUN_ID still pins it`; `ledger audit` now reports 4 runs and returns per-control verdicts |

## Findings

| Severity | File/line | Finding | Required remedy | Status |
|---|---|---|---|---|
| Important | `.aidlc/lib/guard.mjs` `bashContractBlocked` | The narrowing silently shrank the artifact/state carve-out. The string it replaced matched `.aidlc/(artifacts\|state)/` **anywhere** in the command, absolute paths included; `artifactOrState()` wants a repo-relative path, so `echo x > /abs/repo/.aidlc/state/scratch` became blocked where it had been allowed. A behaviour change not stated in the contract, and a false positive of exactly the kind this change exists to remove. | Root the target against `cfg.layout.root` before the carve-out; add the absolute and `./`-prefixed forms to the B1 cases. | **fixed** |
| Nit | `test/gauntlet.test.mjs:95` | The `harness:allow-secret` suppression this change introduces. Reviewed per the policy's "look at this first" rule: it is justified — the string is the injected defect the case exists to detect, the marker sits on the JavaScript line only, and the fixture written from it still carries the live secret, which the same test then asserts the hardening profile fails on. Residual: the marker suppresses the whole line, so a future real credential added to that one line would not be caught. | None now. Worth remembering if that line grows. | accepted |
| Nit | `.aidlc/lib/guard.mjs` | Residual documented in the code: a `>` inside quoted prose followed by a word still reads as a write, e.g. `git commit -m "changed a > b"`. Narrower than the defect it replaces, and closing it needs a shell parser — the tree-sitter decision in `docs/BUILD-PLAN.md` Phase 3 declines that. | None. Documented in the comment. | accepted |

No Blocking findings. Nits capped at 5 by policy; 2 reported, 0 further.

**Test integrity:** no existing test was modified, skipped, or loosened. Three tests were added
(`guard.test.mjs` ×2, `unit.test.mjs` ×1) and one comment was added to `gauntlet.test.mjs`
without touching its assertions. No threshold in `.aidlc/harness.toml` was raised — the secrets
finding was resolved with the scanner's own documented per-line marker, not by weakening the
scanner or setting `fail_fast = false`.

**Scope:** every changed path appears in `## Structure and ownership`. `test/unit.test.mjs` was
added to that section mid-change because scope-drift refused the edit; the contract re-entered
draft, was re-sealed for spec and plan, and was committed before the edit proceeded
(`012c55b`, `eb16d24`, `d48d60a`). The control worked and was not bypassed.

## Risk and rollback

Risk `standard`; no second approver required. All three changes are local and revert cleanly:
`git revert fa422ff` restores the previous guard, secrets marker and ledger behaviour together.

The one asymmetry worth naming: this change *loosens* a guard. If the loosening is wrong, the
failure mode is an unowned product write slipping past `require_contract` rather than anything
breaking loudly. The stated trade in the guard's own header — "a write may slip through, a read
is never blocked" — is unchanged, and B2 pins the writes that must still be refused.

`dispatch.mjs` calls `ledger.newRun()` inside the hook's existing try/catch, which records to the
ledger and returns 0 (`fail open, but recorded`), so a state directory that cannot be written
degrades the run count rather than breaking session start.

## Decision

Agent pass: **approve**, subject to human sign-off (gate 3).

One Important finding was raised and fixed within the review rather than deferred; `--stage commit`
was re-run green afterwards. The change does what the contract says, all four behaviours have named
evidence, and it restores two controls — the stop check and the ledger audit — that were inert.

Outstanding for the human reviewer: this branch has not been pushed and has no CI evidence, and
`41a721d` / `012c55b` share a commit message (the first was a failed re-seal attempt). Both are
cosmetic; neither affects the artifact chain.
