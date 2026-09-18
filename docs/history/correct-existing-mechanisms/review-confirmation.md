# Independent review

Base: 74b6b78d839dde3e1eca257dfdf7a86a4907edee
Candidate: 6a1cd153708156dc75a1df5ed411f88bc0520167
Model: claude-opus-5
Cost USD: 1.2497049999999998
Checks: run separately; not claimed by this review.

# Review: `correct-existing-mechanisms` repair — base `74b6b78` → candidate `6a1cd15`

**Reviewer limitation, stated up front: I ran no tests, no build, and no `harness check`.** Every claim below comes from reading `candidate.diff` and the `candidate/` snapshot. Findings that `harness check --stage commit` already enforces are excluded per `.aidlc/policies/review.md:23`.

This candidate is the repair for the three Importants and five nits in `.aidlc/artifacts/correct-existing-mechanisms/review.md`. I checked each against the tree.

## Suppressions, threshold raises, overridden controls

**None.** No `# noqa`, no lint/type suppression, no raised numeric threshold, no widened `deny_bash`, no relaxed CI condition. Every control-adjacent edit in this diff is text or dead-code removal:

| Location | Change | Direction |
|---|---|---|
| `.aidlc/hooks/dispatch.mjs:104` | refusal message reworded; `bashTouchesProtected(cmd, PREFIX_CACHE_PATHS)` and its `fired()` path unchanged | neutral |
| `.aidlc/hooks/dispatch.mjs:19` | unused imports dropped; no reference remains in the file (confirmed by search) | neutral |
| `.aidlc/lib/artifacts.mjs:102,126` | dead `discardedBy` removed; the approver check at `artifacts.mjs:101` is untouched | neutral |
| `.aidlc/roles/evaluator.md:3-12` | description narrowed, new "require explicit revisions" paragraph; `tools`, `model`, `maxTurns` unchanged | tightened (B2) |
| `.github/workflows/harness.yml:3-5` | comment only; triggers, job `if:` guards and the no-credential `exit 1` at lines 94-97 unchanged | neutral |

Prior Important 1 (evaluator/manifest) was resolved by the documentation route rather than by dropping `evaluator.md` from the manifest — correctly, since `test/contracts.test.mjs:347` requires the manifest to name it and `:335` requires `isolation` to be undefined. That finding should not be re-raised. Prior Important 2 is fixed and now accurate: no `AIDLC_UNATTENDED` or `AIDLC_EVAL` reference survives anywhere under `.aidlc/**/*.mjs`. Prior Important 3 is fixed: `.aidlc/evals/smoke/initial-sandbox-attempt.json:10,13,14` now matches what `evals/agent-mechanisms.mjs:88-92` would have written (`usd: null`, `billingComplete: false`, `reportedUsd: 0` — 0 is right, it is the accumulated total, not a billed figure), and `:15` discloses the hand correction.

## Blocking

None.

## Important

### Important 1 — Compliance pass; spec Outcome ("measured integration evidence and honest limitations"), B5 — `docs/IMPROVEMENT-PLAN.md:116`, `:239-240`

The status table is raised to `A | Complete for item 1 | … hosted CI and explicit read-only evaluator verified`, and line 239 states "Item 1 acceptance is complete", citing run `34046902036` for **implementation 74b6b78**. That is this diff's *base*. The candidate changes source after it: `.aidlc/hooks/dispatch.mjs:104`, `.aidlc/lib/artifacts.mjs:126` (public return shape), and `.aidlc/roles/evaluator.md`, which `test/contracts.test.mjs:333-339` inspects. The cited hosted run did not execute any of it.

`.aidlc/artifacts/correct-existing-mechanisms/evidence.md:14` is scoped correctly ("Hosted CI passed for **implementation 74b6b78**"); `IMPROVEMENT-PLAN.md:239` drops that scope and converts a commit-specific result into a delivery-level completion claim. Worse, the same commit's own evidence says the acceptance is not finished: `evidence.md:48-49`, "A focused confirmation review follows these corrections" — the review you are reading. A delivery whose stated Outcome is honest limitations should not declare completion in the commit that is still awaiting its confirming review and a CI run covering its code.

Fix is in `docs/IMPROVEMENT-PLAN.md` only: scope the claim to the verified commit (e.g. "acceptance verified for 74b6b78; this repair pending re-verification"), or raise the table row after the rerun.

### Important 2 — Compliance pass; B2, spec Outcome — `.aidlc/artifacts/correct-existing-mechanisms/review-initial.md` vs `review.md`, `evidence.md:42-44`

Both files are added in this diff with the same blob (`cb6a2a5`, `candidate.diff:65` and `:144`) — byte-identical, same header `Base: 59e4242 / Candidate: 74b6b78`. `evidence.md:42-44` then says: "The initial bce7cc0 review **timed out before returning findings**. It is incomplete, not approval… The corrected candidate review is recorded separately in `review.md`."

So the artifact directory contains a file named `review-initial.md` holding a complete, cost-bearing review, sitting beside a narrative stating that the initial review returned no findings — and `review-initial.md` is never mentioned in `evidence.md`. B2's "returns findings saved by the caller" makes the saved review the auditable output; a reader cannot tell from the repository which review is which, or whether a timed-out attempt was retroactively given content it never produced.

If the intent is to preserve the 74b6b78 review before `harness review --out …/review.md` overwrites it with the confirmation pass, that is sound — say it in one line in `evidence.md` and name the file. Otherwise drop the duplicate. `.aidlc/lib/artifacts.mjs:21` recognises `review` as a chain kind; `review-initial` is outside it and needs the prose to explain itself.

## Nits (5 reported; no further instances withheld)

1. **Bugs pass; B2** — `.aidlc/roles/evaluator.md:9-12`: `.aidlc/lib/review.mjs:29-33` strips the frontmatter and uses this body verbatim as the prompt for the *authoritative* standalone run. So the B2-conforming path is now told "The native agent form is supplementary analysis, not the independent B2 review path" and "stop and ask the invoking session to run `harness review`" — instructions written for the other invocation mode. Line 12 partly disambiguates. Make the paragraph conditional ("If you were invoked as a native agent rather than by `harness review`, …").
2. **Compliance pass; B5** — `.github/workflows/harness.yml:4-5`: the declared rationale, "duplicate deterministic checks on PR branches are deliberate so a push run cannot cancel or substitute for that PR-only evidence", does not match the file. There is no `concurrency:` group anywhere in the workflow, so no run cancels another, and the `evals` job is already pinned to PRs by `if: github.event_name == 'pull_request'` (`:71`, `:102`, `:106`). The duplication is now declared, as the prior review asked; the stated reason is not the operative one.
3. **Compliance pass; B7** — `docs/OPERATING.md:190-191` says "Neither `AIDLC_UNATTENDED` nor `AIDLC_EVAL` grants an exception", which reads as though both flags still exist and are merely inert, while `:96` says the two "have been removed". Pick one framing; `:96`'s is the accurate one.
4. **Compliance pass; B7** — `.aidlc/hooks/dispatch.mjs:104`: the new text is accurate but ends without a remedy, unlike its sibling at `:97` ("If this is genuinely required, ask the human to run it."). This is the message a blocked operator reads; one clause naming the next step would match the rest of the guard.
5. **Compliance pass; spec Outcome** — `evidence.md:55-56`: "The pre-existing CODEBASE-MAP.md edit is preserved locally and excluded from the commits." An evidence file that cites uncommitted working-tree state describes something no later reader can inspect. Either commit it under the plan or drop the sentence.

## No findings

- **Security pass.** Nothing in this diff touches an authorisation boundary. `dispatch.mjs:95` still applies `APPROVE_IS_THE_HUMANS` unconditionally; `artifacts.mjs:101` still rejects newlines in `--by`; `review.mjs:8-11` still passes `--tools Read,Grep,Glob`, `--setting-sources ''`, `--strict-mcp-config` and `disableAllHooks`, and `:37-40` still refuses to write a report from a failed or empty invocation. No new logging of credentials or PII. The `initial-sandbox-attempt.json` edit removes a fabricated zero rather than adding data.
- **B1, B3, B4, B6** are untouched by this diff. B4's runtime behaviour is unchanged; only the prose describing it moved (`OPERATING.md:190-191`), and it now matches `dispatch.mjs:60,95`.
- Every path in this diff appears in plan `## Files` (`plan.md:18-54`), except the artifact directory itself.

## Verdict

**changes-requested**

Required to clear, both documentation-only, no code or control change: scope the completion claim in `docs/IMPROVEMENT-PLAN.md:116,239` to the commit that CI actually ran, and reconcile `review-initial.md` with `evidence.md:42-44`.

Note for the runner: the prior review was repair attempt 1; this is attempt 2 of at most 2. Neither finding above is a defect in the shipped mechanism — both are claims outrunning their evidence. If the next pass argues the framing rather than adjusting it, send it to the human instead of a third automated repair.
