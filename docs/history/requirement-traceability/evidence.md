# Item 3 evidence and review

User authorization: “approved, continue” after review of this change's concrete spec
and plan. Their approval was recorded with the existing CLI in `20a9435`. This is a
conversation decision recorded by the agent, not a human CLI invocation or authenticated
host review. The governing artifacts were approved with the pre-item-3 format and remain
legacy/unbound; their historical bodies and approval records were not rewritten.

Only item 3 / delivery C was implemented. No registry control, hook, skill, agent,
dependency or control-budget increase was added. Protected fixture sources are unchanged.

## Reproduction and acceptance

- `reproduction.json` and `reproduce.mjs` preserve the original disposable product
  defect: intent correction and semantic relationship edit remain approved; candidate
  scope passes without executing tests. Fixture decisions are explicitly simulated.
- `post-fix.json` records real pytest execution in disposable contract-planned copies:
  the hyphen test fails on original code and passes after the owned implementation;
  an intent clarification makes both approvals stale, and explicit simulated reapproval
  restores the chain. Deselected and skipped tests remain not-executed/skipped.
- `focused-tests.log` records 13 focused tests passing, including the optional real
  Python product trial. The later locale-independent canonicalization regression also
  passed. The default unit suite skips the external Python trial explicitly so the
  harness retains zero package dependencies.
- Focused command: `HARNESS_TRACE_PYTHON=/private/tmp/item1-python/bin/python
  HARNESS_TRACE_EVIDENCE=/tmp/item3-product-proof.json node --test
  test/requirement-traceability.test.mjs test/trace-evidence.test.mjs test/review.test.mjs`.
  Python tooling was already installed in that external temporary environment.
- Binding tests cover source/intent revision capture, unsafe and missing source inputs,
  uncommitted intent, duplicate/nested metadata, ambiguous mappings, transitive staleness,
  stripped/unknown bindings, shallow-history refusal, real Git rebase and closure.
- Execution tests cover exact node IDs, duplicates, malformed and unsupported output,
  absent/skipped/failed tests, stale report files, local changes and mutations during
  candidate checking. Existing candidate-scope regressions remain intact.
- Host tests use injected responses and a fake unavailable `gh` binary: identities,
  pagination, head changes, dismissed/stale reviews, insufficient review count, denied
  push access, unavailable/unsupported policy, API failure, merge identity and changed
  reviews during collection. Simulated transport never sets verified host approval.
  No hosted review, hosted CI run, remote write, model campaign, merge or deployment
  was performed or claimed.

## Verification

The standalone stop stage passed on the implementation:

```text
PASS  secrets     78ms
PASS  test        29093ms
```

The initial full commit stage and clean implementation candidate `4ec2c79` passed all
controls. After the canonical ordering fix, the final implementation candidate is
`022fb7e`; its exact full commit report is preserved in `candidate-report.json`, against
pre-item-3 base `fecbf1466e70a9cc286b5e4cb72fe3e0857e1111`. Documentation/evidence commits
that follow do not change production code. A final candidate stop check covers them.

## Local self-review

B1–B3: the new approval-input digest is separate from the legacy body digest. It binds
all non-audit scalar metadata and transitive inputs. Approval validates required trace
inputs even under --anyway. Status, guard and candidate checks share the same artifact
reader. Legacy history is labelled, not rewritten; shallow history cannot hide a
removed binding. The exact intent snapshot remains recorded, while lifecycle status
alone is excluded from semantic impact to preserve closed semantics. Immutable content
survives harmless rebases; original snapshot objects must remain available.

B4: trace is derived from the current invocation and candidate, not a durable product
index. The old report file is removed before a configured tool runs. Successful proof
requires exact, unambiguous pytest node identity, successful setup/call/teardown, a
passing test command, committed test file and current approvals. Overall verification
and individual proof statuses remain distinct. The runner rechecks tracked checkout
identity after tools run. No executed proof is inferred for TAP, prose or file-only rows.

B5: the host adapter uses read-only GraphQL through authenticated gh, with argument-array
execution and JSON stdin. It compares complete paginated reads twice, verifies repository,
PR and candidate identities, and keeps host evidence separate from model review/local
labels. It does not print credential-bearing API stderr. The adapter conservatively
refuses unsupported visible code-owner/last-pusher policies and unavailable policy.
Its positive assessment is limited to the visible branch review count and current
reviewers with push access plus the host review decision; it is not full merge clearance.

B6: acceptance uses product behavior and negative execution assertions, not just schema
presence. Existing test fixtures were adapted only to supply explicit simulated inputs
before draft commits; historical approval assertions were retained. Full relevant
checks and a clean candidate check passed. No unresolved issue found within the bounded
item 3 scope in this local self-review; this is not an independent evaluator decision.

## Limits

External requirement revisions are asserted by the artifact author. Reviewers still
judge criterion interpretation and assertion adequacy. Configured test tools and the
local runtime are trusted; reports are not signed attestations or a security sandbox.
Only pytest JSON currently provides individual test execution observations. Local dirty
runs and unsupported formats remain unverified. Git snapshot objects and full legacy
history must be available. Host review verification covers the stated visible branch
policy subset; rulesets-only policy, code-owner identity and last-pusher independence
remain unavailable. Host protection and the final human PR/merge gate remain separate.
Items 4–6 have not started.
