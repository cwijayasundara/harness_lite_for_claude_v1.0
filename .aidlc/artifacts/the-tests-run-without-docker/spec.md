---
status: draft
source: docs/DEFECT-REPAIR-PLAN.md
source_revision: 62fea335060175a6327494e6abe04cb37d3c94e4
---
# Spec: the-tests-run-without-docker

## Outcome

Every required unit and integration test runs, and passes, on a machine with no Docker executable
and no daemon.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| D3/F18: every required test runs and passes with no Docker | B1, B2 |
| D3/F18: CI neither installs Docker nor builds an image for those suites | B7 |
| D3/F18: concurrent test files use isolated directories and ports | B3 |
| D3/F18: timeouts and failures leave no orphaned child processes | B4 |
| D3/F18: any remaining container test is a separate opt-in suite reporting honestly | B5 |
| D3/F18: removing a test dependency must not remove an agent's sandbox | B6 |
| D3/F18: no model calls, no credentials | Safeguards |

## Observable behaviours

### B1

Given `evals/lib/stage.mjs`,
When a caller asks for native execution,
Then it receives a staged working directory and a way to run the product under test as a Node
child process: an ephemeral port obtained by binding port 0 and passed through to the child, and a
teardown that runs on success, on assertion failure and on timeout.

Native mode is requested explicitly by the caller. It is never inferred, and never becomes the
default for a path that previously containerised.

### B2

Given a machine with no `docker` executable on `PATH` and no reachable daemon,
When the ordinary test suite runs,
Then the eight behavioural tests run as ordinary ungated tests and pass: private ledger acceptance
rejecting no-op and faulty products; the deterministic campaign preserving failed evidence and
external approvals; incomplete calls retaining evidence; private HTTP acceptance across
persistence, rule changes and storage failure; comparison campaigns grading both arms and detecting
unapproved writes; unparseable review being incomplete; self-approval detection; and leaked servers
returning findings before the deadline.

They keep the assertions they have. A test that moves and loses an assertion has not moved.

### B3

Given several test files running concurrently under `node --test`,
When each stages a native run,
Then each gets its own temporary directory and its own port, and none collides with another. A
port is claimed by binding port 0 and reading back the assigned number, never by picking a
constant.

### B4

Given a native run that times out, throws, or fails an assertion,
When the test ends,
Then its child process is gone and no listening socket survives it. This is asserted, not assumed:
the suite checks that the process the test started is no longer running.

`test/product-trials.test.mjs` already contains a test about leaked servers, which is the reason
this behaviour is stated rather than left to teardown discipline.

### B5

Given the three tests that assert operating-system isolation — that `fs.readFileSync` throws for
the private grading file, for `evals/products.json`, for `/plugin/evals/tasks.json` and for
`/var/run/docker.sock`; that the native comparison sandbox's secret is unreadable; and that a
timed-out run removes its container rather than only its client —
When Docker is unavailable,
Then they are not run, they are not skipped silently, and they are not counted as integration
coverage. They live in a separate, explicitly named opt-in container suite, and the suite reports
that it did not run.

**A skip that prints green is the defect this change exists to remove; it must not be reintroduced
under a new name.** On a machine without Docker the container boundary is not verified, and the
output says so.

Alongside them, and not instead of them, the native path asserts what it genuinely provides: that
the private grading files sit outside the tree handed to the child process. That claim is true and
useful, and it is never described as isolation. A directory is not a sandbox.

### B6

Given a live product trial, which runs a real coding agent with Write, Edit and Bash,
When it is launched,
Then it takes the container path, with the boundary `productDockerArgs` already builds —
`--read-only`, `--cap-drop=ALL`, `--network none`, `--security-opt=no-new-privileges`, an
unprivileged uid and explicit bind mounts — and it cannot select native mode.

This is asserted by a test, not left to the shape of the code. The two paths stay visibly distinct
at the call site, so that a future reader can see which one a live agent gets without tracing a
flag through three functions.

### B7

Given a push or a pull request,
When CI runs,
Then the required unit and integration jobs install no Docker and build no image, and they run the
eight moved tests. The opt-in container suite runs as a distinct job whose failure is a failure and
whose absence is visible. A container job that did not run is never evidence that the boundary
holds.

## Design

`stage()` gains an explicit execution mode. The container path is unchanged in behaviour and
remains what `isolateStage` and `productDockerArgs` describe. The native path stages the same tree
and returns a runner that spawns Node directly, with the assigned ephemeral port passed to the
child and a teardown registered for every exit route.

The two are kept apart at the call site rather than merged behind a flag that reads the
environment, because the thing being protected is the property that a live agent cannot
accidentally get the weaker one. `evals/lib/stage.mjs:15` already takes an options object; the mode
belongs there, named, with no default that silently changes an existing caller.

**What is deliberately not attempted.** No native equivalent of the isolation assertions is
invented. No test claims that a temporary directory constrains a child process running as the same
user. The container remains the only thing this repository describes as a boundary.

## Out of scope

- Changing the container boundary itself, or the arguments `productDockerArgs` builds.
- The duplicate `stop` execution in the commit check — D2, `a-check-runs-the-suite-once`.
- The guard's target extraction — D1's residual findings, recorded in its review.
- Making live product trials cheaper, faster, or differently authenticated.
- Any claim that native mode is a security boundary. It is not, and nothing here may imply it is.

## Safeguards

- **A live agent cannot reach native mode.** B6 asserts it. This is the one property whose loss
  would make this change harmful rather than merely incomplete.
- **No test describes a directory as a sandbox**, in an assertion, a name, or a comment.
- **The moved tests keep every assertion they had.** Coverage is relocated, not reduced.
- **A container suite that did not run reports that it did not run.** Never a green line.
- **Fixtures under `evals/fixtures/` are untouched.**
- **Zero dependencies; `[limits]` unchanged; no new control.**
- **No model call, no credential, no network access** beyond binding a local ephemeral port.
