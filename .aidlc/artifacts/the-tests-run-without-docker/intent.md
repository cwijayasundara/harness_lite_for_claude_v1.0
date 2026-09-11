---
status: draft
source: docs/DEFECT-REPAIR-PLAN.md
source_revision: 62fea335060175a6327494e6abe04cb37d3c94e4
---
# Intent: the-tests-run-without-docker

- **Date:** 2026-09-10
- **Author:** cwijayasundara
- **Source:** `docs/DEFECT-REPAIR-PLAN.md` item D3, filed at the bound `source_revision`. Backlog
  item F18.

## Problem

**Eleven tests do not run on a machine without Docker, and a skip is not coverage.**

`test/product-trials.test.mjs` defines twelve tests; eleven carry
`{ skip: process.env.HARNESS_PRODUCT_DOCKER !== '1' }`. On any machine without Docker they are
silently skipped, and the suite reports success. CI builds `evals/Dockerfile` to reach them, which
means the only place they run is the one place nobody watches them run. The stated constraint is
that unit and integration tests must not depend on Docker.

**The eleven are not one kind of test, and that is the whole difficulty.**

*Eight are behavioural and portable.* Private ledger acceptance rejecting no-op and faulty
products; the deterministic campaign preserving failed evidence and external approvals; incomplete
calls retaining evidence; private HTTP acceptance across persistence, rule changes and storage
failure; comparison campaigns grading both arms and detecting unapproved writes; unparseable review
being incomplete; self-approval detection; leaked servers returning findings before the deadline.
Each needs a working directory, a Node child process and an ephemeral port. None needs a container.
They use one because `stage()` is the only thing that hands them an isolated tree.

*Three assert operating-system isolation, and are not portable at all.* `test/product-trials.test.mjs:43`
asserts `fs.readFileSync` **throws** for the private grading file, for `evals/products.json`, for
`/plugin/evals/tasks.json` and for `/var/run/docker.sock`; `:162` asserts the same for the native
comparison sandbox's secret; and one asserts that a timed-out run removes its *container* rather
than merely its client. A child process running as the same user on the same kernel can read those
files. There is no honest native equivalent, and pretending otherwise would convert a real security
assertion into a decorative one.

**The constraint that makes this dangerous.** `evals/lib/stage.mjs` is shared with the live
invoker. A live product trial runs a real coding agent with Write, Edit and Bash inside
`productDockerArgs`' container — `--read-only`, `--cap-drop=ALL`, `--network none`,
`--security-opt=no-new-privileges`, an unprivileged uid and explicit bind mounts. That container is
the agent's security boundary, not a test fixture. Removing a *test's* dependency on Docker must
not remove an *agent's* sandbox, and the two paths run through the same module.

## Proposed outcome

Every required unit and integration test runs, and passes, on a machine with no Docker executable
and no daemon.

Observable from outside the system:

- With `docker` absent from `PATH` and no daemon reachable, the ordinary suite runs the eight moved
  tests as ordinary ungated tests and passes.
- CI neither installs Docker nor builds an image to run the required suites.
- Concurrent test files get isolated directories and ephemeral ports; nothing collides.
- Timeouts and failures leave no orphaned child processes.
- Whatever container tests remain are a separate, explicitly named opt-in suite that reports
  honestly when it has not run, rather than reporting success.
- A live product trial still takes the container path, and that is asserted rather than assumed.

## Affected users and systems

- `evals/lib/stage.mjs` — gains a native execution mode; shared with the live invoker.
- `test/product-trials.test.mjs` — eleven gated tests, of which eight move.
- `.github/workflows/harness.yml` — the image build and the `HARNESS_PRODUCT_DOCKER` gate.
- `evals/Dockerfile` — still needed by whatever opt-in suite remains.
- Anyone running the suite on a laptop without Docker, which is the case this change exists for.
- The claim the suite makes about itself. Eleven skips currently read as eleven passes.

## Constraints

- **Native mode is for tests driven by a fake invoker only.** A live trial must not be able to
  select it. The two paths stay visibly distinct and which one a live trial takes is asserted.
- **No test may describe a directory as a sandbox.** A directory is not a sandbox. If a moved test
  can only assert that private files are outside the tree the child was given, it says that.
- Zero dependencies; `[limits]` unchanged; no new control.
- Fixtures under `evals/fixtures/` are write-protected and are not edited.
- No model call and no credential in any of this.

## Open questions

**One decision belongs to the human, and it is the reason this item is last.**

**What happens to the three isolation assertions.** They cannot run natively and they are the only
tests that check the boundary a live coding agent runs inside. Two options, and a recommendation:

1. *Keep them as an explicitly opt-in container suite* — a separate file, named so that its absence
   is obvious, reporting plainly when it has not run, and not counted as ordinary integration
   coverage. The boundary stays tested wherever Docker exists; on a laptop it is untested and says
   so. **Recommended.** It is the only option that keeps a real assertion about a real boundary.
2. *Re-scope them to what native execution genuinely provides* — that the private grading files sit
   outside the tree handed to the child process. That is a true and useful statement, and it is not
   isolation. Taken alone it would leave the container boundary with no test at all, which is worse
   than the status quo for the one property most worth protecting.

The recommendation is 1, with 2 added alongside for the native path rather than instead of it. The
consequence to accept explicitly: on a machine without Docker the container boundary is **not**
verified, and the suite must say so rather than printing a green line.

A second, smaller question: whether CI keeps running the opt-in container suite. The recommendation
is yes — it is the one environment where Docker is guaranteed — but it must be a distinct job whose
failure is a failure, not a skip.
