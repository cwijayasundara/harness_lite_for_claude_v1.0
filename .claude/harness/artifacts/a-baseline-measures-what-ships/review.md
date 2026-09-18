# Independent review

Base: e54963a7e48bff5bb0e9ad0757f5dc825740d65d
Candidate: ebdb0c4192fbccf760599f3855118fdcf1d04da2
Model: claude-opus-5
Cost USD: 1.9088880000000004
Checks: run separately; not claimed by this review.

# Review: `a-baseline-measures-what-ships`

Base `e54963a7e48bff5bb0e9ad0757f5dc825740d65d` → candidate `ebdb0c4192fbccf760599f3855118fdcf1d04da2`
Read: `candidate.diff`, `candidate/` snapshot, `.aidlc/artifacts/a-baseline-measures-what-ships/{spec,plan}.md`, `.aidlc/policies/review.md`.
**No tests, checks or commands were run by this reviewer.** Every claim below is read from source at the candidate revision; where a claim depends on execution I say so.

## Controls overridden, suppressed, or re-thresholded

No `# noqa`, no `[limits]` change, no tolerance change (`tolerance` stays `1.10` at `.aidlc/baseline.json:3`), no skipped test, no new exclusion. Two movements touch a control, and one is cosmetic:

1. **`.aidlc/baseline.json` re-records every ratcheted metric upward in the same commit that makes the record blocking.** `claude_md_tokens` 672→1516, `check_stop_tokens` 12→1888, `pack_tokens_p50` 476→1186, `session_context_tokens` 52→649, plus `graph_modules` 32→543 and `graph_symbols` 113→1650. Raising the record has the same effect as raising the tolerance once. Detail in Important-1.
2. `hook_loc` moved 255→212 by relocating 43 lines from `.aidlc/hooks/` to `.aidlc/lib/session.mjs`, which `checks/budget.mjs:57` does not count. Disclosed in the plan and in `docs/IMPROVEMENT-PLAN.md`. The limit is 600 (`.aidlc/harness.toml:74`), so nothing was near it and no control was relieved. Not a finding.

## Blocking

**B-1 — `harness baseline check` and the gate now return different verdicts from the same file. (cites B3, B4; Compliance pass)**
`.aidlc/checks/baseline.mjs:35-43` turns every `result.unknown` key into a finding and returns `verdict: 'fail'`. The verb at `.aidlc/bin/harness:357-359` prints only `result.rows` and returns `result.ok ? 0 : 1`, and `ok` is computed at `.aidlc/lib/baseline.mjs:104` from `rows` alone. A recorded file carrying a retired key therefore **fails the commit stage and exits 0 from the verb, printing nothing about it**.

- B3 states: "`harness baseline check` continues to work as a verb, and reports the same verdict as the gate." They no longer agree.
- B4 states the trigger explicitly: "Given `.aidlc/baseline.json`, **When it is read by `harness baseline check`**, Then … a key present in the file that `capture()` does not produce is reported rather than silently ignored." The verb still ignores it silently; only the new gate reports it.

`.aidlc/bin/harness` is not in the plan's `## Files`, so this is a gap between the approved spec and the approved plan, not a slip in an owned file. The divergence is latent today (the re-captured file has no retired key) but it is exactly the `wiki_index_tokens` scenario B4 was written for. Fix is one line in the verb: surface and grade `result.unknown` the same way the check does.

## Important

**I-1 — Four ratcheted figures were re-recorded with evidence for only one. (cites B5, spec Safeguards; Compliance pass)**
B5 and the safeguard require the correction to be legible so "the first gated run cannot be read as a regression and cannot be used to argue the tolerance should be raised." `docs/IMPROVEMENT-PLAN.md` (diff 360-382) does that properly for `session_context_tokens`: byte-identical payload, 2,594 characters, 33 lines, before and after. For the other three it offers one clause — "a record stale since 2026-08-24" — and no measurement. `check_stop_tokens` 12→1888 is a 157× movement; nothing in the diff distinguishes "the 2026-08-24 record was taken against a different tree" from "the stop-stage render genuinely grew." `graph_modules` 32 against a repo of 543 modules suggests the former, which would mean the whole prior record was incomparable — a stronger statement than "stale," and one that should be written down rather than inferred by a reviewer. As it stands the gate's first act is to bless three unexplained rises and freeze them as the new floor. Requested: one sentence per moved metric saying what the old figure measured, or a re-capture at the base commit recorded as evidence.

**I-2 — The gate does not ship. `.aidlc/templates/harness.toml:34` still reads `commit = ["stop", "secrets", "scope-drift", "budget", "tamper", "arch", "test_quality"]`. (cites B3; Compliance pass)**
That template is what `harness init` writes into a consuming project, and `.aidlc/bin/harness:219` tells the operator at init time to run `harness baseline capture`. So an installed project captures a baseline and nothing grades it — the precise defect this change exists to remove ("the ratchet was written … but no stage did"), left intact everywhere except this repository. `.aidlc/artifacts/dormant-sensors-run-at-commit/plan.md:47-49` is the precedent: that change updated both stage lists. A consuming project with no recorded baseline is safe by construction (`.aidlc/checks/baseline.mjs:20` returns `pass` with a note), so enabling it by default costs nothing. I note the template is not in this change's approved `## Files`; if it is deliberately deferred, say so in the delivery record rather than leaving the two lists disagreeing.

**I-3 — The gate runs a full nested stage inside a stage: the test suite executes twice per `commit`, and a failing suite can be reported as a context-surface regression. (cites B3; Bugs pass)**
`.aidlc/checks/baseline.mjs:22` calls `capture()`, which at `.aidlc/lib/baseline.mjs:40` runs `check(cfg, { stage: 'stop', all: true })`. `stop = ["fast", "test"]` (`.aidlc/harness.toml:26`) and `test` is `node --test test/*.test.mjs` (line 11). Three consequences:

- `harness check --stage commit` now runs the whole suite twice on any run that reaches `baseline` — once as the commit stage's own `stop`, once inside the gate. Neither spec nor plan mentions this cost; the plan calls the gate "a thin adapter."
- With `--all` (`runner.mjs:120` disables fail-fast), a genuinely failing test no longer stops before `baseline`. The nested render then carries every finding plus the two-line footer at `runner.mjs:215-219`, so `check_stop_tokens` balloons and the gate emits `baseline/check_stop_tokens = N, recorded 1888` — blaming the context surface for a test failure. `ENVIRONMENT_SENSITIVE` (`baseline.mjs:80,92`) only skips on `errored`, not on `fail`, so nothing suppresses it.
- Because `baseline` is now stage-addressable via `LOCAL_CHECKS` (`runner.mjs:33`) while `capture()` hardcodes stage `'stop'`, any project that names `baseline` in `stop` or `fast` recurses without bound, each level spawning a full test run. There is no guard. A flag threaded through `capture()` (or measuring a rendered report the caller already has) closes all three.

**I-4 — Two newly-gated metrics are computed over transient paths. (cites B3; Bugs pass)**
`[graph] include = [".", ".claude"]` and the exclude list (`.aidlc/harness.toml:39-40`) covers neither `.claude/worktrees/` nor `.aidlc/evals/comparisons/`. `CODEBASE-MAP.md` confirms both are indexed: `.claude/worktrees/agent-a7f345ed8b4114891/.aidlc/lib/graph.mjs` sits in the hub table with 7 dependents, and two `.aidlc/evals/comparisons/2026-09-09T07-09-53-869Z/.../round.mjs` rows appear in it. `capture()` selects the top-5 hubs and packs their symbols (`.aidlc/lib/baseline.mjs:51-56`), so `pack_tokens_p50` — recorded at 1186 and now blocking at +10% — changes when an agent worktree or an eval comparison directory appears or is deleted, for reasons unrelated to the surface the harness controls. `graph_modules`/`graph_symbols` inherit the same dependence but are not in `RATCHETED`, so they only mislead the record. I could not execute a capture to quantify the swing; the dependence itself is plain from the four cited lines.

**I-5 — The new B2 test mutates the live repository's ledger state. (cites B2; Bugs pass)**
`test/unit.test.mjs:319` runs `execFileSync('node', [ROOT/.aidlc/bin/harness, 'hook', 'session-start'], { cwd: ROOT })` with no `HARNESS_RUN_ID` in the environment. `dispatch.mjs:131` calls `ledger.newRun(cfg.layout)`, which at `ledger.mjs:28-33` writes a fresh id to `.aidlc/state/run-id` unless that variable is set. So each execution of the unit suite rotates the repository's own run id mid-session: rows appended afterwards are attributed to a run a test created, and the 30-day run count the session banner reports (`session.mjs:283`) is inflated by test runs. `ledger.mjs:21-25` describes that counter as the denominator the audit depends on, and the audit is the only query that authorises deleting a control. Every other baseline test in this file works inside `stage(...)`; this one does not. `ledger.mjs:29` already provides the fix — set `HARNESS_RUN_ID` for the subprocess, or stage a fixture.

**I-6 — The unknown-metric path fails a build while both of its own comments call it "reported, not graded." (cites B4)**
`.aidlc/checks/baseline.mjs:33-34` says "Reported, not graded as a ratchet metric," and `.aidlc/lib/baseline.mjs:99-102` says "Reported here rather than graded: the repair is a re-capture, not a tolerance argument." But line 43 derives `verdict` from `findings.length`, so a retired key blocks `commit` exactly as a regression does. On a harness upgrade that retires a key, every consuming project's commit stage is red until someone re-captures. Either outcome is defensible under B4's wording ("visible instead of graded"); what is not defensible is the code and its comment disagreeing about whether it stops a build. Decide one and make both say it.

## Nits (4)

1. **B1's primary assertion cannot fail.** `test/unit.test.mjs:303` asserts `b.session_context_tokens === estimateTokens(sessionContext(cfg))` while `capture()` computes that value by calling the same function (`baseline.mjs:36,62`) — a tautology for as long as the import exists, which is the condition it is meant to prove. The guard at line 305 (`length >= 5`) is close to the fixture's actual payload size. The real proof of B1/B2 is the cross-process comparison at line 319-334; the plan's Proof table credits B1 to the tautological one.
2. `.aidlc/checks/baseline.mjs:20` interpolates a literal: `` `no baseline recorded — run: ${'harness baseline capture'}` ``. Inline the string.
3. `unknown` is `Object.keys(base).filter(k => !(k in now))` (`baseline.mjs:103`), which does not distinguish metrics from bookkeeping keys (`captured_at`, `tolerance`, `model`, `errored_controls`). If a future `capture()` drops one of those, the finding at `checks/baseline.mjs:38` will call it a metric that is "no longer captured." Filter to the metric namespace, or reword the message.
4. The B5 record in `docs/IMPROVEMENT-PLAN.md` lists `claude_md_tokens`, `check_stop_tokens`, `pack_tokens_p50` and `wiki_index_tokens` but not the `graph_modules` 32→543 and `graph_symbols` 113→1650 movements in the same file. Ungraded, so harmless — but it is the one paragraph a future reader will use to decide whether the record is trustworthy.

## Evidence and uncertainty

- **Verified by reading source at the candidate revision:** B-1 (verb vs check verdict paths), I-2 (template stage list), I-3 (nested `check` call, stage resolution, fail-fast and render behaviour), I-4 (graph include/exclude against the indexed paths in `CODEBASE-MAP.md`), I-5 (test → hook → `newRun` → `runId` write), I-6.
- **Confirmed compliant:** B1's recorded figure is 649 (`.aidlc/baseline.json:6`); B4's `wiki_index_tokens` is absent; B2's single assembly — `dispatch.mjs` holds no second construction, `invocation` has exactly one definition (`lib/session.mjs:268`) and its other consumer at `dispatch.mjs:114` still resolves; the step-9 re-anchoring of `evals/lib/comparison.mjs` matches the extracted text (`import { fileURLToPath }`, `export function sessionContext(cfg) {`, two-space indent) and keeps the round-trip and `source drift` assertions, which is legitimate test maintenance, not weakened coverage; tolerance, `[limits]` and `evals/fixtures/` are untouched as the safeguards require.
- **Not verified — no execution:** I ran no tests, no `harness check`, and no capture. I cannot confirm the payload is byte-identical across the extraction (I-1 rests on the diff's own claim), cannot confirm the suite passes, cannot measure the doubled `commit` runtime in I-3 against the 180s spawn timeout at `runner.mjs:76` or the 120s sensor latency budget, and cannot quantify I-4's swing.
- **Not resolvable from the exported snapshot:** `docs/IMPROVEMENT-PLAN.md` names `76b37ebf1200521db6cbd713524f868945ea729f` as the landing commit for B5. I have no repository to resolve it in and cannot confirm it lies in `e54963a7..ebdb0c41`. B5's remaining clauses (`captured_at` = 2026-09-09, correction stated as a corrected measurement) are satisfied on the face of the file. B5 is prose evidence, which the plan itself concedes no test can grade.
- **Passes:** Bugs — I-3, I-4, I-5, nits 1-3. Security — nothing found; the only new external surface is a metric key read from a local trusted `baseline.json` interpolated into rendered output, and no credential, PII or log path is touched. Compliance — B-1, I-1, I-2, I-6, nit 4.
- **Repair budget:** the change's `review.md` is an unfilled draft template with an empty findings table, so on the record available to me this is the first review of this change and the two-return limit is not engaged.

## Recommendation

`changes-requested` — B-1 breaks a clause each of B3 and B4 state explicitly, and I-1/I-2/I-3 mean the ratchet ships un-wired to consuming projects, freezes three unexplained figures, and can misreport a test failure as a context regression.
