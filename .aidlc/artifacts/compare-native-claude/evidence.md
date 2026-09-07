# Item 4 evidence

User authority: the instruction to implement item 4 automatically, test thoroughly, merge to main
and push. The spec/plan records preserve this conversation authorization; no past approval was
rewritten and no additional production skill, agent, hook binding or control budget was added.

## Calibration and corrections

- The first sandboxed launch could not access Docker. Its schedule is retained as unmeasured in
  `.aidlc/evals/comparisons/2026-09-07T05-03-19-984Z/`; no model call was launched. This is not a passing comparison.
- The initial live runner at `1f68a1c` used a restricted shell allowlist. All four native/harness
  first-change smokes passed ($0.6461475). The first native paired ledger and service campaigns
  passed all eleven changes, with one repair retry. The native service's seeded-defect step
  exposed avoidable permission friction: local runtime probes and killing a stuck test process
  were denied. This is infrastructure friction, not evidence that native Claude lacks capability.
- That configuration was intentionally retired after a model response had been saved, before
  its next call. Total reported spend at retirement was $3.98860035. The interrupted harness
  ledger attempt retains phases plus `abandonment.json`, `abandoned-product/` and runtime data
  alongside the untouched original comparison record under
  `.aidlc/evals/comparisons/2026-09-07T05-07-48-076Z/`.
- Both comparison arms now get normal Bash access within the same restricted Docker filesystem,
  PID namespace and resource limits. Planning and independent review remain read-only. Private
  grading and external decisions are not mounted. Native installs no harness or plugin.
- A deterministic malformed-review test reproduced an incorrect repair retry. Invalid/failed
  evaluator responses now stop as incomplete. Other tests cover premature product writes,
  self-approval metadata before proposal replacement, missing billing, abandoned schedules,
  model/credential preflight, matched grants and alternating paired order.
- Hosted run `34086120868` passed Docker and Python cost checks but failed the two `rg`-dependent
  unit tests because Ubuntu did not have ripgrep. The unit job now installs that prerequisite.

## Graph evidence

Freshness uses source content and paths rather than edit notifications alone. Tests exercise a
same-mtime shell edit, deleted symbol, rename and branch checkout. Stale advisory loads return
no cache; normal queries rebuild it. Stop refresh no longer requires an edit-hook dirty file.
The deleted `renderWiki` benchmark entry now names the live `renderPack` symbol, and a golden
entry must resolve to an actual definition. The competent baseline searches declarations with
`rg`, falls back to literal references, and charges visible search hits plus bounded reads.
Whole-file totals remain historical context. Lookup recall alone does not establish product benefit.

## Final outcome

The normal-shell run at `af5ee31` was gracefully stopped. Its 48 scheduled campaign attempts
are retained: 5 passed, 1 failed the overly narrow approval wording check, 2 are incomplete
(one model timeout and one operator stop), and 40 are explicitly unmeasured. The native ledger
passed all five changes; the native service completed five changes before its valid "Should I
proceed?" request was falsely rejected. The final implementation removes this keyword gate;
source and approval metadata remain checked before external authorization. A deterministic
Docker regression reproduced the false failure and then passed with ordinary wording.

The initial retired run retains six passed campaigns and one abandoned partial campaign. Do
not pool its restricted shell policy with the corrected configuration to infer a model winner.
Across retained runs, reported spend is $7.45033505. One timeout has unknown billing; $1.50 was
reserved for it, giving $8.95033505 of reported/reserved allowance. No further paid trials were
launched after the user's runtime feedback.

A 30-minute default suite deadline now limits each new model invocation to the remaining time
and marks remaining scheduled attempts unmeasured. Private verification and cleanup can finish
after the deadline. An injected-clock regression verifies no further model calls are launched.
Failed verification candidates now receive a disposable Git commit before repair for replay.

Verification: 35 targeted tests and all 11 Docker tests passed after the final fixes. The earlier
hosted run at `af5ee31` passed unit/graph, Docker and Python cost jobs. Its unit job had 271 passes
and 11 skips: ten Docker cases are covered by the separate Docker job, and the Python fixture
check (skipped for missing ruff/pytest there) passed locally. Full local commit checks also pass.
Final hosted delivery is recorded below after push.

Comparative acceptance remains incomplete. The graph and generation-strategy product matrix
is unmeasured, unnecessary-question totals remain unclassified, and no superiority or general
reliability conclusion is justified. Item 5 pruning remains outside this delivery.
