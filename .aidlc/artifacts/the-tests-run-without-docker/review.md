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

---

# Round 2 — the repairs (763699b..24409fd)

**VERDICT: changes-requested.** One blocking regression introduced BY the round 1 repairs, three
minor, one nit. Round 2 judged sound, with no finding: round 1's findings 1, 2, 3, 6b, the
strengthened B4 proof, and the implementer's disagreement with finding 4.

## Blocking — a regression the repairs introduced

### R2.1 — B2 / Design: the 6a repair changed the CONTAINER path too

`evals/lib/assertions.mjs:396-403`. The `/unwritable/items.json` replacement was applied to both
paths. The two are unwritable for different reasons and neither carries over: the container's
`/unwritable` is unwritable because `/` is `--read-only`, while `<s.root>/not-a-directory` is a
host path the container cannot see at all — `s.root` is `mkdtemp` under `os.tmpdir()`, which on
Linux is `/tmp`, and `productDockerArgs` mounts `--tmpfs /tmp`. Inside the container that path is
an absent directory on a **writable** filesystem; the reference server saves with
`mkdirSync(dirname, {recursive:true})`, so `POST /items` returns 201 and the 503 case asserts the
opposite of what it means to.

It fails only on Linux. On macOS `TMPDIR` is `/var/folders/...`, unmounted and under a read-only
`/`, so it still behaves. **It would have passed on this machine and broken on ubuntu-latest and
in Linux live trials**, and no test in the suite covers it — `verifyService` is reached in
container mode by live product trials (`evals/run.mjs:255`, `evals/lib/comparison.mjs:99`) and
`evals/products.json:177` has a service step at level 6.

**Repaired** by branching on `s.exec`: the host path for process mode, `/unwritable/items.json`
unchanged for the container.

## Minor

### R2.2 — the runbooks are stale, and are not owned

`docs/OPERATING.md:107` and `evals/README.md:56` both still document
`HARNESS_PRODUCT_DOCKER=1 node --test test/product-trials.test.mjs`, the README asserting it
"exercises isolation". No green claim is produced any more — the report line is unconditional and
correct — but a reader following the documented command believes the boundary was checked when the
file it names can no longer check it. **Neither file is in the plan's `## Files`.** Ownership is
the human's decision; this is recorded, not fixed.

### R2.3 — pid reuse is narrowed, not eliminated

`evals/lib/stage.mjs`. Between `spawnSync` reaping the child and `ps` running, the kernel may
recycle that pid onto a new group leader whose `pgid` then matches. The window is real and
narrower than the PPID walk it replaced, but it is not zero, and the same window exists on the
`kill(-pid)` first attempt. Excluding `process.pid` is otherwise sufficient. `ps -Ao pid=,pgid=`
is portable to macOS and procps alike. **Recorded in the code as a known limit** rather than
papered over.

### R2.4 — a missing `ps` degraded silently

`evals/lib/stage.mjs`. An empty or failed `ps` left the loop doing nothing, degrading to the group
kill already measured insufficient — a tool absence reporting success. **Repaired**: the reaper
now throws naming `ps` rather than returning quietly.

### R2.5 (nit) — instruction and configuration disagreed

`evals/lib/campaign.mjs`. Agent-facing text said `PRODUCT_TEST_COMMAND` while a process-mode
`harness.toml` was configured with `--test-force-exit`. Harmless, since B6 bars a live agent from
process mode. **Repaired**: both now derive from `productTestCommand(s.exec)`.

## Evidence after the round 2 repairs

- `test/product-trials.test.mjs`: 14 pass, 0 fail, 0 skipped, 15.3s
- full suite, `docker` absent from `PATH`: 447 tests, 446 pass, 0 fail, 1 skipped
  (`test/trace-evidence.test.mjs:90`, `HARNESS_TRACE_PYTHON`, pre-existing, not Docker)
- `node --test test/container/*.test.mjs` with no daemon: 4 tests, 0 pass, 4 fail, 0 skipped
- reaper probe: child alive `false`, grandchild alive `false`

## Round 2 uncertainty

Nothing was executed by the evaluator in either round; both are read-only inspection over the
evidence the caller supplied.

- **R2.1 is derived from source**, not observed: `os.tmpdir()` on Linux, the `--tmpfs /tmp:rw` in
  `productDockerArgs`, and the reference server's recursive `mkdirSync`. Confirming it needs a
  Linux container run of `verifyService(s, 6)`. On macOS it will keep passing either way.
- **`--test-force-exit` may truncate pipe-buffered stdout.** `process.exit()` does not flush pipes,
  and `test/product-trials.test.mjs:173` asserts `out.stdout` matches `/FAIL\s+test/`. It passed in
  every run here, including at load average 9.5, but that is not proof it cannot truncate. This is
  a latent flake in an assertion this change made depend on that flush.
- The grandchild check could observe a zombie before init reaps it. That is a false **failure**,
  not a false pass.
- Pid-reuse probability inside the reap window (R2.3) is unmeasured; the race was not exercised.
- **No container-path claim in either round has been executed.** There is no Docker daemon on this
  machine, so every statement about the container path — including that it is now byte-identical —
  is read from source. The `container-boundary` CI job is the first thing that will actually run
  it. That is a property of the machine, not of the change, and it is exactly the condition B5
  exists to make visible rather than assumed.

## Standing decision for the human

R2.2 is the only finding left unrepaired, because fixing it means writing to two files the
approved plan does not own. Amending `## Files` and re-approving, or recording it as a follow-up
defect, is the human's call at gate 3.
