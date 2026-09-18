# Verification: automated product trials

## Behaviour evidence

| Spec | Evidence |
|---|---|
| B1 | Real Docker mount probes deny private reads, source writes during planning, and approval/Git/plugin writes during implementation. Product code runs without networking or credentials, separately from parent assertions. |
| B2 | Ledger run records actual SessionStart, approval pauses, rejected-spec correction, stale receipt refusal, committed simulated approvals, resumed sessions and two fresh sessions. Parent receipts cannot be fabricated by editing artifacts. |
| B3 | Five ledger changes passed independent API checks; all five committed product versions passed replay against verifier 7dbdc44. Fees remained unchanged. |
| B4 | Six service changes passed independent HTTP checks; all six committed versions passed replay, including actual restart, increasing IDs, retained 80-character titles after the 40-character limit, and unavailable storage. |
| B5 | Live missing-tool, external rename, seeded overdue review/repair and JSON parsing regression were observed. The operational failure produced an incident and follow-up intent. Deterministic graders reject empty and deliberately faulty implementations. |
| B6 | Every live attempt has phases.json and product Git history. Deterministic timeout and thrown-invocation tests retain snapshots and unknown billing. No-call budget exhaustion records zero spend; invocation exceptions reserve their allowance. |

## Actual trials

The full attempt used driver `5df1a80d82fa02569698dd019307ee544b72ad0e`, Claude Code
2.1.263, configured generator `claude-sonnet-5`, and independent product evaluator
`claude-opus-5`. Raw usage also retains the CLI's auxiliary Haiku accounting.

- Ledger: 5/5 changes, 15 model invocations including the independent review, USD 1.50230865.
- Service: 6/6 changes, 12 model invocations, USD 1.4185619.
- Combined: 2 passing campaigns, no incomplete steps, USD 2.92087055 reported.
- Earlier failed calibrations: USD 0.577427 reported; retained, not replaced by the passing run.

The portable machine-readable record is `.aidlc/evals/product-summary.json`. It contains exact
source/image identities, individual check counts, decisions, replayed revisions, and paths to
the private local evidence. Full transcripts and source histories are intentionally gitignored.
The fresh-data HTTP fix was tested against a known-correct reference service and all six actual
generated service revisions. No generated product was manually repaired to earn a pass.

## Defects reproduced and fixed during delivery

- Docker's nested bind mounts caused Git ownership refusal despite real committed approvals;
  the container now trusts exactly `/work` through explicit Git configuration.
- Docker Desktop returned stale bind-mounted source/data after host edits and deletion;
  immutable source snapshots and fresh independent data mounts fix this while preserving
  actual data across process restart within each scenario.
- The eval scope helper rejected the generated `CODEBASE-MAP.md` that the production scope
  checker already exempts; the helper now follows the same existing rule.
- Host-keychain-only authentication could be reported as usable inside an isolated container;
  product preflight now requires a forwarded environment credential and fails closed.
- Thrown model transports left the invocation allowance available for a later attempt;
  the suite now reserves it when billing is unavailable, with a regression test.
- A public test that hung survived the Docker client's timeout. A direct probe reproduced the
  still-running container; the new named-container cleanup terminates it, and a regression
  test verifies that no test container remains.

## Deterministic and hosted verification

Seven Docker tests passed locally and on GitHub Ubuntu. The full commit-stage check passed
secrets, unit tests, scope, budget, tamper, architecture and test quality. GitHub run
34062622771 passed product-sandbox, unit (including graph benchmark), and cost jobs at
`12b77b9`. The PR-only golden model job was skipped on that branch-push event; the actual
product campaigns above are separate evidence, not a claim that the golden suite ran there.

The separate whole-change evaluator timed out after 180 seconds and again after 480 seconds,
each with a USD 2 cap. Neither returned a verdict or reported billing. `review.md` records the
caller-written disposition; no independent approval of the harness implementation is claimed.

Final stop check:

```text
PASS  secrets     564ms
PASS  test        26006ms
```

## Limits

One successful run per campaign does not establish a statistical reliability rate. Scripted
approval tests do not assess human judgment. Containers are bounded execution environments,
not proof against container-runtime exploits. Deployment was local and disposable. No new
production control or control-budget increase was introduced.
