# Item 5 preparation evidence

Inspected clean repository revision c10e2b5fe7e1242bc5feb827df664517f236a8e5.
Only new preparation artifacts and the evolution-plan handoff were written. Production
implementation is pending the concrete spec and plan gates; item 6 was not started.

## Product reproduction

`node .aidlc/artifacts/product-design-context/reproduce.mjs` passed its defect assertions.
The recorded result is in reproduction.json. A disposable contract-planned copy executes
`Mary-Jane Watson`, while an approved but unmerged proposal is reported as superseding that
rule. The product diff is empty and the original spec remains byte-identical. All fixture
approvals and integration are simulated. Source fixture directories were not modified.

The first reproduction attempt used a Python namespace import that collided with the runtime's
module resolution; the final script loads the exact product file with runpy and was rerun.

## Preparation validation

`node .aidlc/bin/harness check --stage stop`:

```text
PASS  secrets     72ms
PASS  test        29553ms
```

`git diff --check` passed. No implementation acceptance, host review, merge, deployment or
candidate validation is claimed by these preparation checks. The intended implementation
checks and product lifecycle trial are specified in plan.md.

## Implementation and approval record

The user replied “approved and continue” to the concrete spec and plan. The existing approval
CLI recorded that decision as cwijayasundara in d8b0635, following preparation commit 2120ec4.
This records a conversation decision, not a human CLI invocation or authenticated host review.
The selected worktree change is product-design-context. Historical approved bodies are intact.

Implementation adds a derived delivery index and extends graph query, revision-aware pack,
status presentation, map guidance and existing review/navigation instructions. It adds no
control, dependency, hook, skill, agent or budget increase. Item 6 remains unstarted.

## Product exit trial

`HARNESS_TRACE_PYTHON=/private/tmp/item1-python/bin/python node
.aidlc/artifacts/product-design-context/post-fix.mjs` passed. The existing local Python environment
supplies pytest/json-report; no project/runtime dependencies were added. The default python3
lacked json-report on the first attempt; the saved successful trial used this explicit interpreter
and the existing pytest adapter, not unsupported observations.

post-fix.json preserves exact revisions and candidate check reports for the original rule,
authorised simulated requirement correction/reversal, and refactor. Each reports passed actual
pytest behavior proof; existing product regression tests also passed. A real local no-ff merge
models integration. Approval and host observations are simulated and labelled. Historical views,
original spec bytes, unchanged refactor assertions, cache rebuild and honest miss assertions pass.
This is a deterministic disposable product trial, not a paid model campaign or hosted acceptance.

## Local validation

Focused command `node --test test/product-context.test.mjs test/pack.test.mjs
 test/graph.test.mjs test/map-drift.test.mjs`: 39 passed at that run. Subsequent reachable-history
and integration-order regressions extend that coverage; the order regression also passed alone.

Standalone `node .aidlc/bin/harness check --stage stop`:

```text
PASS  secrets     78ms
PASS  test        65749ms
```

Local `node .aidlc/bin/harness check --stage commit`:

```text
PASS  secrets     89ms
PASS  test        64842ms
PASS  scope-drift 230ms
PASS  budget      1ms
PASS  tamper      171ms
PASS  arch        27ms
PASS  test_quality 30ms
```

The integration-order fix and its focused regression followed that local full-stage run.
Final clean candidate validation will include it and all current code. git diff --check passed.
See review.md for local self-review findings and limits. No hosted CI, live host approval,
remote configuration, merge or deployment is claimed.

The final product script rerun again passed all three actual pytest proof observations,
historical queries, cache rebuild and fallback with the corrected source revision chain.
A later standalone stop run (including the delivery-order fix) passed:

```text
PASS  secrets     118ms
PASS  test        67550ms
```

The final unsupported-source rendering regression additionally checks that artifact context
cannot hide a structural graph miss. Final clean candidate checks include this last change.


## Final clean candidate validation

Implementation commit `d16f9979072cb47e0bfcdc346292395eaf9da2b6` passed the complete commit
stage against pre-item-5 base `c10e2b5fe7e1242bc5feb827df664517f236a8e5`:

`node .aidlc/bin/harness check --stage commit --base c10e2b5fe7e1242bc5feb827df664517f236a8e5
--candidate HEAD --change product-design-context`

```text
PASS  secrets     157ms
PASS  test        68198ms
PASS  scope-drift 162ms
PASS  budget      2ms
PASS  tamper      251ms
PASS  arch        27ms
PASS  test_quality 28ms
```

candidate-report.json and candidate-output.txt preserve exact revision identities and all seven
passing controls. This final run includes the delivered-order, reachable-history and unsupported
source rendering regressions. The Node suite's success is not promoted to per-behavior pytest
execution in this harness report; those distinctions remain visible in its trace.

A real CLI query on this repository at that commit returned 50 delivery-unknown changes and no
unavailable error. This is expected: historical local approvals and implementation records do
not substitute for the new explicit archived delivery observations. No delivery.json or host
approval was invented for the harness itself. The final evidence-only archive follows the checked
implementation revision; no hosted run or merge is inferred.
