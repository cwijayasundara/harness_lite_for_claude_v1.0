# Item 2 implementation evidence

## Authorization and scope

The user requested item 2 only, then replied “yes approved” to the concrete spec and
plan. Drafts were committed at 210806f; the existing approval CLI recorded that
conversation decision under the audit label cwijayasundara at 1ae7ad5. The agent ran
the CLI. This is not a claim of authenticated host approval or a human CLI invocation.
The draft-status prose inside the approved plan is historical; its digested body was
preserved after approval. Implementation selected pr-candidate-scope explicitly.

Items 3–6 were not started. No fixture source, existing approved artifact, registry,
control limit, dependency, hosting setting or external repository was changed.

## Product defect and acceptance

reproduction.json preserves the pre-fix contract-planned product result: the same
out-of-scope edit fails locally, then incorrectly passes after commit with a clean
checkout. The first new B1 regression also failed against the old runner (`true !==
false`). post-fix.json records a clean committed product violation correctly failing
with exact base/candidate identities. Both trials used disposable copies and existing
simulated fixture approvals, not newly asserted human decisions.

The candidate test suite covers B1–B6: multi-commit scope, additions/deletions, both
rename endpoints and positive owned cases, unusual filenames, literal shell arguments,
invalid revision/CLI input, candidate HEAD and checkout cleanliness, selected gate
validity, nonpersistent selection, untracked intent/proof, report and ledger identity,
forced scope inclusion, and built-in tamper/secrets using the candidate boundary.
The CI tests use diverged Git branches and a detached PR head, exercise event parsing,
and execute the actual workflow shell pipeline to prove its nonzero exit survives tee.
Local scope tests retain staged, unstaged and untracked coverage, including renames.

Focused tests passed. The final implementation's commit-stage run passed:

```text
PASS  secrets     69ms
PASS  test        20112ms
PASS  scope-drift 83ms
PASS  budget      1ms
PASS  tamper      117ms
PASS  arch        28ms
PASS  test_quality 28ms
```

The full stop stage also passed during implementation:

```text
PASS  secrets     133ms
PASS  test        20330ms
```

The initial full-suite run exposed an onboarding regression: local scope/tamper
reported Git errors before a repository's first commit, preventing installed-project
budget checks. The fix explicitly skips these two local sensors only when Git confirms
there are no commits. Real diff errors and all invalid candidate boundaries still fail.
Existing budget regressions then passed unchanged. No assertions were weakened.

## Self-review and limits

Reviewed the complete implementation diff and ran git diff --check. Fixed shell
substitution and replacement-placeholder handling for filenames; argument-array Git
calls and NUL-delimited path lists preserve path identity. Tamper reads each file's
patch with a literal pathspec. CI uses an explicit Bash shell with pipefail, PR head
checkout, full history, a computed merge base, environment variables, and read-only
repository permission. Consumer shim execution is covered by the actual shell test.
No new control or dependency was introduced.

This is local deterministic validation and self-review, not an independent hosted
review, paid campaign, PR merge or deployment. Host branch protection must separately
require the candidate job. Existing legacy approval and artifact exemption policies
remain; endpoint diffs omit intermediate changes reverted before the candidate.
Configured external tools retain their semantics beyond literal file-list inputs.
Proof presence does not demonstrate execution. Candidate checks require the candidate
to be checked out and do not replace local pre-commit checks.
