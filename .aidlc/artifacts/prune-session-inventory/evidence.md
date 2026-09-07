# Item 5 validation evidence

## Outcome
The complete matched pruning experiment is validated. **Retain the production baseline.**
Both arms passed all eleven product changes, with zero verification failures, unplanned repair
invocations and realized approval violations. The lean arm showed higher observed cost and
latency, so this sample does not justify removing the automatic session-start budget inventory.
The production hook, its approval guards and all production limits remain unchanged.

| Full paired campaigns | Baseline | Lean |
|---|---:|---:|
| Accepted changes | 11 / 11 | 11 / 11 |
| Reported USD | 2.65329365 | 2.78598495 |
| USD per accepted change | 0.241209 | 0.253271 |
| Campaign latency | 752.364 s | 844.444 s |
| Unplanned repair invocations | 0 | 0 |
| Realized approval violations | 0 | 0 |
| Manual product interventions | 0 | 0 |
| Denied tool attempts | 4 | 1 |

The lean arm cost 5.0% more and took 12.2% longer. One pair does not establish a statistically
reliable performance difference or universal reliability. It does provide completed evidence
for this conservative retention decision. Unnecessary-question counts remain unclassified.
The four baseline denials were scratch-reproduction attempts; the lean denial was a help-only
`harness approve --help` request. The latter was a false block, not an approval attempt. Neither
raw firing counts nor fewer lines are treated as evidence that a boundary should be removed.
No causal autonomy improvement from the inventory change is claimed.

## Complete live run
Source: `.aidlc/evals/comparisons/prune-2026-09-07T12-09-53-533Z/comparison.json`.
All four calibrations and four full campaigns passed using requested Sonnet 5 generation and
Opus 5 seeded review. Actual model IDs and all reported auxiliary usage remain in the records.
The ledger exercised rejection, stale approval, rule reversal, seeded review and repair,
storage extraction, external rename and documentation. The service exercised validation,
missing-tool recovery, persistence/restart, the changed title limit, parsing repair and a storage
incident returning 503 without state mutation. Human decisions were explicitly simulated by
the external driver. No manual intervention in the product campaigns was required.

Reported spend: **USD 6.1403661**, billing reported for every invocation in this run. Wall time:
30 minutes 25 seconds under the explicitly approved USD 9 / 40-minute cap. Pruning defaults now
match that validated command; the default-duration adjustment is checked by `--prune --dry`.
The live run explicitly supplied 40 minutes, so it used that same effective limit.

## Repaired existing evaluation problems
A previous correct ledger document was rejected by the phrase heuristic. Failed candidate
`e8e4e1bf3f0fed5f86a952a6c41738296067efc4` correctly said the overdue function returns false once
outstanding reaches zero (fully paid). The supporting heuristic now accepts that code-formatted,
wrapped wording. Regression tests still reject the old rule and a returns-true statement.
Private API assertions are unchanged; the original failed grade, repair turn and cost remain.

The saved seeded service tests also reproduced a hang after assertions failed and server cleanup
was skipped. Node's 10-second test timeout now bounds disposable staged checks, reproduction
instructions and comparison public checks for both arms. A deterministic leaked-server test
returns failure normally before the outer 25-second deadline. Original fixtures and production
timeout settings are unchanged. The prior model timeout had no tool trace, so the reproduced
hang is not claimed as its conclusively proven cause.

## Prior attempts retained
The initial restricted attempt could not access Docker and launched no model calls. The USD 8
run passed four calibrations, spending USD 0.6921728, but its conservative full-suite estimate
exceeded the cap. The USD 9 / 20-minute attempt passed the baseline ledger and four service
changes before an unbilled planning timeout left both lean campaigns unmeasured. The user's
subsequent request to fully validate and explicit approval of the fresh USD 9 / 40-minute run
superseded the earlier unanswered continuation question.

Across every attempt: reported USD **9.92484655**; reported plus reserved allowance USD
**11.42484655**. Actual total cost remains unknown because the earlier timeout omitted billing.
No missing billing or incomplete outcome is treated as zero cost or a pass.

## Local verification
Stop check:
```text
PASS  secrets     457ms
PASS  test        21942ms
```

Pre-authorization commit-stage diagnostic (historical):
```text
PASS  secrets     786ms
PASS  test        28538ms
FAIL  scope-drift 227ms
PASS  budget      3ms
PASS  tamper      71ms
PASS  arch        29ms
PASS  test_quality 120ms
```

All twelve deterministic Docker tests passed, including private-data isolation, approval
checks, seeded/no-op rejection, HTTP persistence/recovery, timeout cleanup and the leaked-server
regression. The final Docker test run completed in 29.59 seconds with zero skips. Unit tests
also cover exact experimental isolation, inverse restoration, unchanged graph source, source
drift rejection, single-arm scheduling and budget projection, and documentation grading.
Whitespace checks and the saved CODEBASE-MAP.md checksum passed.

The earlier `draft-awaits-gate` failure was resolved after the user explicitly instructed
"merge all the changes to main and push to github" on 2026-09-07. The ordinary approval path
recorded that conversation authorization against committed spec and plan artifacts. Required
relationships to existing specifications were added; earlier approvals were not rewritten.
The final commit-stage check passed every control, including scope drift:

```text
PASS  secrets     825ms
PASS  test        58141ms
PASS  scope-drift 138ms
PASS  budget      2ms
PASS  tamper      40ms
PASS  arch        31ms
PASS  test_quality 117ms
```
No hosted CI or separate independent whole-change model review is claimed for item 5.

## Reproducibility
Portable results: `.aidlc/evals/pruning-summary.json`. Full phases, product Git histories,
runtime data and actual model usage remain under ignored `.aidlc/evals/comparisons/prune-*`.
The matched run has a `driver.patch` and `driver-identity.json` recording the base revision and
source hashes of the uncommitted driver used. Per-attempt fixture and plugin digests identify
staged inputs. The default-duration change after the run is described above. Neither arm's
production source was altered during the matched run. The existing CODEBASE-MAP.md edit is intact.
