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

Final corrected-run results and delivery checks will be appended after verification completes.
