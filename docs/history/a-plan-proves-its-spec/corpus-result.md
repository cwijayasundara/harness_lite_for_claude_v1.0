# B5 — the check run across the existing corpus, 2026-09-05

Given this repository's own changes, the check runs across them, and whatever it refuses is
reported here. No artifact was edited to make it pass.

## Method

For every `spec.md` in `.aidlc/artifacts/*/` (27 change directories, every one this repository
has), and every corresponding `plan.md` where one exists: `templateMarkers('spec', specBody)` and
`templateMarkers('plan', planBody)` from `.aidlc/lib/artifacts.mjs`, and — where both files exist —
`behavioursOf(specBody)` compared against `proofRowsOf(planBody)` for a missing row. This is the
same content check `approve()` now runs, applied to the corpus regardless of each artifact's
current `status:` — approved, draft, or `migrated_from` — because the question B5 asks is what the
check finds across the corpus, not only across the three artifacts F16 records as `approved`.

## Result

- 27 change directories examined.
- 0 template-marker hits — no `spec.md` or `plan.md` in this repository still carries a
  `harness new` placeholder or a bare `### B<n>` Given/When/Then.
- 0 missing-Proof-row hits — every `### B<n>` a spec claims has a matching row in its plan's Proof
  table.

## What this does and does not mean

This matches what the spec predicted: "Measured before writing this spec: zero of the plans
reachable today omit a proof row. That result means less than it appears." It still means less
than it appears, for the same reason F16 gives — a clean corpus result says the twenty-seven
artifacts a human or an agent actually wrote here happen not to trip either check, not that the
check is untested. B1 and B2 are exercised directly, with fixtures built to trip them, in
`test/gate-content.test.mjs`. This file is the corpus measurement B5 asks for; the test file is the
proof that the check works when something does trip it.

One thing this run did find, outside B5's own scope: `approve()`'s new content check, run against
`test/lifecycle-cli.test.mjs`'s existing fixtures (`gate-order`, `drifted` — both built with the
real, unedited `harness new` scaffold, on purpose, to test approval *state* rather than content),
now refuses those approvals. See the implementation report for detail — B5 above is unaffected by
it, since neither fixture is a committed artifact in this repository's own corpus.
