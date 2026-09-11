---
status: draft
---
# Review: a-check-runs-the-suite-once

Independent evaluator (Opus 5, read-only), base `63bf08b` → candidate `8ca88af`.

## Findings

| Severity | Cites | Finding |
|---|---|---|
| Low | B2 | **`identityErrors: []` is hardcoded and the generator's justification was incomplete.** `check()` does stop before any control when identity fails pre-loop (`runner.mjs:154-158` — `stopped` is set unconditionally, *not* gated by `failFast`, so the claim holds even under `--all`). But `runner.mjs:181` pushes `'runtime or policy changed during checks'` **after** the loop. A fresh nested `check()` inside `capture()` had its own before/after window and would render an `ERR identity` line and `ok:false`; the reconstruction structurally cannot. Bounded to mid-run runtime/policy mutation, where the enclosing commit report still records the error and fails. |
| Low | B2 | **Test fidelity gap.** The B2 test feeds `stopReportFrom` the *built* `inFlight.controls`; production feeds the raw `results` array (`runner.mjs:168`). The shapes differ — built controls carry already-capped `findings` plus `truncated`, and `buildReport` recomputes `truncated` from the sliced list. Both coincide on a green tree, so the test passes without exercising the production input. Production is correct; the assertion is weaker than it reads. |
| Low | B2 | **`--changed`/`--files` narrows the reconstructed scan.** `secrets` scans `files` when non-empty (`checks/secrets.mjs:18`); a fresh `capture()` always passed `files: []`, a full tracked-file scan. A commit run started with `--changed`/`--files` (`bin/harness:256`) therefore reconstructs a narrower scan. No token movement — one PASS line either way — but findings could differ. Unreachable in this repository's own runs, which pass no files. |
| Low | B1 | **The before/after elapsed figures were not recorded in the repository**, only in the caller's transcript. Closed by this file. |

## Verified, no finding

- **B6 stop-shape.** `resolveStage` returns a fresh array per call (`config.mjs:84`), so `check()`'s candidate-mode `verbs.unshift('scope-drift')` cannot contaminate it; `verbs.map` fixes stage order; `evidence` is never passed, so the `revision` spread cannot fire — structurally, as claimed.
- **B4 soundness under `--all`.** Every stop verb still runs, so the reconstruction is complete, and a failing `test` yields `stop_ok:false`, which makes `compare()` skip `check_stop_tokens` exactly as the old path did.
- **B5 token movement.** `estimateTokens = ceil(len/4)` (`pack.mjs:11`), and `render()` omits `command`, `changed_files`, `provenance` and `trace`. Only `ms` digit count varies — about 2 characters, roughly half a token, against headroom of 1.2; failure needs more than 13.2. `provenance: null` and `files: []` are read by nothing downstream: `capture()` uses only `controls` and `ok`.
- **B3 standalone.** `bin/harness:352` calls `capture(cfg)` with no options, so `stopReport` is `undefined` and the old path runs.
- **Refactor safety.** `buildReport` is a verbatim lift of the old `runner.mjs:158-181` — same key order, same cap and `truncated` arithmetic. Only `validCandidate` moves to a parameter, passed explicitly by `check()`.

## Evidence and uncertainty

- **The evaluator ran no tests and no `harness check`** — read-only inspection of the diff and surrounding sources only.
- It relied on, and did not reproduce, the caller's `--stage commit` PASS and the 75,351 ms → 8,375 ms figure.
- It did not exercise the mid-run identity-drift path.

## Measured evidence, recorded here because the evaluator correctly found it absent

`harness check --stage commit`, same tree, same machine:

| Control | Before | After |
|---|---|---|
| `baseline` | 75,351 ms | **8,037 ms** (generator) / **8,375 ms** (caller's independent run) |
| total | 2:24.03 | 1:36.44 |

The `baseline` control now does only its own graph and pack work. `test` timing varies between
67 s and 162 s across runs under differing machine load and is not the signal; `baseline`'s
collapse is. Step 1's failing test read `2 !== 1` before any fix, confirming the duplicate
invocation directly rather than by inference from elapsed time.

`check_stop_tokens` remained 12 and the `baseline` control reported PASS against an unmodified
`.aidlc/baseline.json`. Neither `.aidlc/baseline.json` nor `.aidlc/harness.toml` was written.

**Flagged by the generator, not fixed, per the plan's explicit instruction:** a standalone
`harness baseline check` under heavy load reported `check_stop_tokens 12 -> 56 SKIP (toolchain
differs)` because the `test` control exceeded `runOne`'s hardcoded 180,000 ms `spawnSync` timeout
(`runner.mjs:82`) and errored. That is the designed errored-control skip, exit 0 and `ok: true`,
and it reproduces independently of this change.

## Recommendation

**approve** — the reconstruction is genuinely equivalent on every path this repository reaches,
and the four findings are bounded, non-blocking, and better handled as follow-ups than as changes
to this diff.

## Carried forward, not fixed here

1. The B2 test should feed `stopReportFrom` the raw `results` array rather than built controls, so
   it exercises the production input shape.
2. `runOne`'s 180,000 ms `spawnSync` timeout is hardcoded with no flag (`runner.mjs:82`) — the same
   shape as the `harness review` timeout, and it makes a slow machine look like a missing toolchain.
3. Mid-run runtime/policy drift is representable in a fresh stop report and not in the
   reconstruction.
