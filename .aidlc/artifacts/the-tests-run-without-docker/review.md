---
status: changes-requested
base: 6e678c0
candidate: 12d844d
evaluator: harness-evaluator (opus), read-only, round 1
---
# Review: the-tests-run-without-docker

**VERDICT: changes-requested.** One blocking finding, six major, four minor. Three findings were
independently re-verified by the caller against the working tree and are marked CONFIRMED.

## Blocking

### 1. B5 — the boundary report is an operator-settable flag, not evidence (CONFIRMED)

`test/product-trials.test.mjs:236-243`. The claim is derived from
`process.env.HARNESS_PRODUCT_DOCKER === '1'` alone; nothing checks that
`test/container/product-boundary.test.mjs` ran. `docs/OPERATING.md:107` still documents
`HARNESS_PRODUCT_DOCKER=1 node --test test/product-trials.test.mjs` — on a Docker-less machine
that exact documented command prints `container boundary: verified this run by
test/container/product-boundary.test.mjs` while that file is never collected.

A green claim for a suite that did not run is precisely the defect B5 exists to remove,
reintroduced as an environment variable instead of a `# SKIP`. The claim must come from the
container suite itself — a receipt it writes that the reporting test reads — never from a variable
an operator can set.

Note: the honest fix touches `docs/OPERATING.md`, which is **not** in the plan's `## Files`.
Fixing it requires a plan amendment and re-approval.

## Major

### 2. B5 — the opt-in suite still skips silently

`test/container/product-boundary.test.mjs:23,47,58`. All three moved tests kept
`{skip: process.env.HARNESS_PRODUCT_DOCKER !== '1'}`. `node --test test/container/*.test.mjs`
without the variable is green with three `# SKIP`s and no report — the exact pattern B5 forbids,
inside the file created to end it. CI sets the variable (`.github/workflows/harness.yml:77`), so
only a human running the opt-in suite by hand meets this.

### 3. Spec deviation — `--test-force-exit` changes the container path

`evals/lib/stage.mjs:14`. `PRODUCT_TEST_ARGS` is consumed by the container path at
`evals/lib/campaign.mjs:395` and written into every product stage's `harness.toml`
(`stage.mjs:38`). The spec's Design says "The container path is unchanged in behaviour." This is a
material change to an approved boundary condition and belonged back with the human before landing.

Masking risk the evaluator raises: `--test-force-exit` calls `process.exit()`, which does not flush
pipe-buffered stdout — and `test/product-trials.test.mjs:173` now depends on that flush for
`assert.match(out.stdout,/FAIL\s+test/)`. A failure raised after the last test settles (unhandled
rejection in async teardown) no longer influences the exit code.

**Caller's correction to the evaluator's UNCERTAINTY.** The evaluator speculated the flag may not
have been needed because `--test-timeout=10000` already bounds the hang. That is wrong, and it was
measured before the flag was added: the seeded leaked-server case returned
`elapsed_ms: 25009, status: null, signal: SIGKILL, error: ETIMEDOUT`. `--test-timeout` bounds a
test that *hangs*; this test *fails instantly* and it is the file's process that then refuses to
exit. The flag was necessary. Whether it may be applied to the shared constant is the open
question — scoping it to `exec:'process'` only would resolve the deviation.

### 4. B1/B4 — teardown does not run on every exit route (CONFIRMED)

`evals/lib/stage.mjs:92`: `if ((r.error || r.signal) && r.pid) killProcessGroup(r.pid);`. B1
requires teardown "on success, on assertion failure and on timeout". A run that exits normally
having leaked a descendant is never reaped. The claimed mirror with Docker is inexact: the
container branch also carries `--rm`, which cleans unconditionally; `docker rm -f` is its second
line of defence, not its only one.

### 5. B4 — the proof is vacuous (CONFIRMED)

`test/product-trials.test.mjs:199-204` asserts only that the *direct* child pid is gone.
`spawnSync`'s own `killSignal:'SIGKILL'` already guarantees that. The test passes unchanged if
`killProcessGroup` is deleted. Nothing exercises a grandchild, which is the entire reason the group
kill exists.

### 6. B2 — two assertions now pass for a different reason (6b CONFIRMED)

(a) `evals/lib/assertions.mjs:396` still uses `dataFile:'/unwritable/items.json'`. The 503
storage-failure case previously followed from the container's `--read-only`; it now follows from
the host root being unwritable. Running as root — dev container, root CI — `mkdirSync('/unwritable')`
succeeds and the case inverts.

(b) `evals/lib/campaign.mjs:419` runs `claude`, `node` and `rg` on the host and asserts status 0.
Three of the eight (comparison campaigns, unparseable review, self-approval) now require the Claude
CLI and ripgrep on `PATH`, which the image used to guarantee; `result.cli` records the host's
version, not the image's. Independently reproduced: with `~/.local/bin` off `PATH` these three fail
while every other test passes.

## Minor

### 7. `evals/lib/stage.mjs:82-88` — the strip is right, the inheritance is broad

The `NODE_TEST_CONTEXT` / `NODE_TEST_WORKER_ID` diagnosis and strip are correct, and clearing them
in `spawnDetachedProcess` is harmless. But `productEnv` merges the entire host environment where
the container passed only explicit `--env`: `NODE_OPTIONS`, `HARNESS_HOME` and
`CLAUDE_CODE_OAUTH_TOKEN` now reach the product child, and `invoker.mjs:47-49`'s own rule (delete
`AIDLC_EVAL` / `AIDLC_UNATTENDED`) is not mirrored. The strip itself masks nothing.

### 8. `evals/lib/campaign.mjs:301` — message not updated

The process branch still asserts with "container must see committed approvals" while no container
ran. The plan promised this message would become accurate for whichever branch executed.

### 9. B3 — `claimPort` does not reserve

`evals/lib/stage.mjs:69-75` closes the probe socket before returning, so a concurrent binder can
take the port between the claim and `spawnDetachedProcess` (`assertions.mjs:326`).
`assert.notEqual(portA, portB)` (`test/product-trials.test.mjs:190`) relies on OS port rotation
rather than any guarantee. Flaky in principle.

### 10. B6 — the proof does not establish the spec's enumeration

`evals/lib/invoker.mjs:69`: the live path passes `network: true`, so a live trial gets
`--network bridge`, not `none`. The new test asserts `args.includes('none')` only for
`phase:'runtime'` (`test/product-trials.test.mjs:212`), a path a live agent never takes, and
`includes('none')` matches any bare `'none'` argument. Not a regression — the guard itself
(finding: none) is sound — but B6's proof is weaker than B6's text.

### 11. `evals/lib/campaign.mjs:389-391` — writability differs

`publicCheck`'s process branch runs `node --test` in a writable `s.work`; the container runtime
phase mounts `/work` read-only. A product test that writes now succeeds where it previously failed.

## What the review did not find

No finding against the B6 guard itself: `evals/lib/invoker.mjs` refuses `exec:'process'` before any
invocation setup, and no caller can reach the live invoker with a process-mode stage. The one
property whose loss would make this change harmful is intact.

## Uncertainty

- Whether the reporting test's `console.log` survives `--test-reporter=tap`
  (`.aidlc/harness.toml:11`) and reaches a human, or is swallowed as stray TAP output.
- Real orphan behaviour of `spawnDetachedProcess` under a crashing test file.
- The container path could not be exercised at review time: no Docker daemon was running on the
  review machine. Every container-path claim here is read from source, not observed — which is
  itself an instance of what B5 is about.
