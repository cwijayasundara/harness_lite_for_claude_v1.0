---
status: approved
spec_digest: sha256:9d5f0af2b23caff2575ad827326b1cc6918bdb5bbf4a1694bf50ca1d2ef0ffde
spec_approval_digest: sha256:1003e11cdf979c0b05e0888e724eef0b3b09aef77375eb671b684884c994bf10
by: cwijayasundara
at: 2026-09-11T05:52:36.442Z
digest: sha256:673453ed3047ee651067b9374a0c2c52fc9ef7943fa565e058d013328c8b563c
approval_version: 2
approval_digest: sha256:39d54b3e06d39e74c568d1d48780b4c78965436738234431db1c3a3e933e07e7
---
# Plan: the-tests-run-without-docker

## Approach

One named execution mode, threaded through the four call sites that actually reach Docker, and a
live path that refuses the weaker one.

**The mode is `exec`, not `native`.** `stage()` already takes `native`, and it means the
native-Claude comparison arm — no harness installed (`evals/lib/stage.mjs:35-38`), used by the
comparison campaigns with `{product:true,native:true}`. Reusing that word for "no container" would
make `{native:true}` mean two unrelated things in one options object. So: `stage(fixtures, name,
{ exec: 'container' | 'process' })`, defaulting to `'container'`, recorded as `s.exec`. No existing
caller changes meaning, and nothing reads the environment to decide.

**Four call sites, not one.** The spec's Design names `stage.mjs`, but the eight tests reach Docker
through three modules. `evals/lib/assertions.mjs:188` (`ledgerCalls`), `:263` (`reportingCalls`) and
`:312,323` (`serviceProcess`); `evals/lib/campaign.mjs:185` (`runProductCheck`), `:374`
(`publicCheck`), `:229-233` (image and CLI preamble) and `:284` (`harness status`). Each gets a
`s.exec === 'process'` branch beside the container branch it already has — visibly beside it, at the
call site, which is what B6's second paragraph asks for. No dispatcher hides which one ran.

**The process branch is a host child process, and is never called a sandbox.** It spawns
`process.execPath` with `cwd: s.work`, in its own process group (`detached:true`), and kills the
group on timeout — `process.kill(-r.pid,'SIGKILL')` — exactly mirroring the `docker rm -f name`
line already sitting under each container spawn. That mirror is the point: the container branch
kills the container rather than the client, and the process branch kills the tree rather than the
direct child. B4 is the assertion that this works.

**Ports.** `serviceProcess` currently hardcodes `PORT:'3000'` and `DATA_FILE:'/data/items.json'`,
both container-absolute. The process branch binds port 0, reads the assigned number back, closes
the probe socket and passes that port to the child; `DATA_FILE` becomes the host `s.data` path.
Requests go over `fetch` from the test process to `127.0.0.1:<port>`, replacing `docker exec`. The
parent still never imports product code — fetching a port is not importing a module.

**Two assertions do not survive the move, and are not pretended away.** `runProductCampaign` opens
with `docker image inspect` (`campaign.mjs:229`, whose failure is `incomplete: isolation_unavailable`)
and `docker … claude --version` (`:233`). Both are provisioning checks for the container image. In
`exec:'process'` mode they have no honest equivalent and do not run; the result records
`exec:'process'` instead of `image`. These are campaign preamble, not assertions belonging to any of
the eight tests, so B2's "keeps every assertion it had" is untouched. The container path keeps both.
Likewise `campaign.mjs:284`'s message "container must see committed approvals" becomes accurate for
whichever branch ran; the assertion itself — that `harness status` reports
`current: <slug> (plan approved)` — is unchanged.

**B6 is enforced, not just tested.** `evals/lib/invoker.mjs:65` chooses `docker` whenever a sandbox
is passed. It gains one guard: a sandbox with `exec === 'process'` throws rather than invoking. A
live trial cannot select the weaker path even by mistake, and the test asserts the throw rather than
asserting the shape of the code.

**B5 keeps the three where Docker exists and reports the gap where it does not.** They move to
`test/container/product-boundary.test.mjs`. The ordinary suite's glob is `test/*.test.mjs`
(`.aidlc/harness.toml:11`) and is not recursive, so that file is not in the ordinary suite at all —
it cannot print a green line, because it does not run. `test-quality.mjs:8` reads the same flat
directory and is likewise unaffected. In its place the ordinary suite gains one test that prints
whether the boundary was verified and by what, so the absence is stated in the output rather than
inferred from a missing line. Alongside it, and not instead of it, a process-mode test asserts the
true and weaker claim: the private grading file is written outside `s.work`, the tree handed to the
child. It is named for what it checks and never uses the word sandbox.

Alternative considered and rejected: keeping the three in `test/product-trials.test.mjs` behind a
named skip reason. `node --test` prints `# SKIP` and the run stays green, which is the defect this
change exists to remove, reintroduced under a better label.

## Files

- `evals/lib/stage.mjs`
- `evals/lib/assertions.mjs`
- `evals/lib/campaign.mjs`
- `evals/lib/invoker.mjs`
- `test/product-trials.test.mjs`
- `test/container/product-boundary.test.mjs`
- `.github/workflows/harness.yml`
- `CODEBASE-MAP.md`

## Order

1. Move the three isolation tests verbatim into `test/container/product-boundary.test.mjs`,
   keeping their `HARNESS_PRODUCT_DOCKER` gate, and delete them from
   `test/product-trials.test.mjs`. Confirm `node --test test/*.test.mjs` no longer collects them
   and `node --test test/container/*.test.mjs` does.
2. Add the failing tests first, in `test/product-trials.test.mjs`: `exec:'process'` staging returns
   a distinct directory and an ephemeral port (B1, B3); a timed-out process run leaves no live
   descendant (B4); `invokerArgs`/`invoke` refuses an `exec:'process'` sandbox (B6); the private
   grading file lies outside `s.work` (B5's native half); and the boundary-reporting test (B5).
   They fail against the current code.
3. `evals/lib/stage.mjs`: accept and record `exec`, defaulting to `'container'`; add the port-0
   helper and the process-group spawn helper used by the branches below.
4. `evals/lib/invoker.mjs`: refuse `exec:'process'` on the live path. Step 2's B6 test goes green.
5. `evals/lib/assertions.mjs`: process branches in `ledgerCalls`, `reportingCalls` and
   `serviceProcess`, the last taking the ephemeral port and the host `DATA_FILE`.
6. `evals/lib/campaign.mjs`: process branches in `runProductCheck` and `publicCheck`; skip the
   image/CLI preamble in process mode and record `exec` instead; make the `harness status` branch
   use the real bin.
7. Ungate the eight in `test/product-trials.test.mjs` — remove the `skip` option and stage them
   with `{exec:'process'}` — keeping every assertion each already carries.
8. Run the suite with `docker` removed from `PATH` and confirm the eight pass and nothing skips.
9. `.github/workflows/harness.yml`: `unit` keeps `node --test test/*.test.mjs` and installs no
   Docker; replace the `product-sandbox` job with a distinct container-boundary job that builds the
   image and runs `node --test test/container/*.test.mjs` with `HARNESS_PRODUCT_DOCKER=1`, whose
   failure fails the build.
10. Regenerate `CODEBASE-MAP.md` with `.aidlc/bin/harness map`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/product-trials.test.mjs` — `exec:'process'` staging returns its own work directory, an ephemeral port from binding port 0, and a teardown that runs on pass, on assertion failure and on timeout; container remains the default when `exec` is omitted |
| B2 | `test/product-trials.test.mjs` — the eight named tests run ungated and pass with `docker` absent from `PATH`; each retains the assertions it had before the move, verified by diffing the assertion lines against `7bd762d` |
| B3 | `test/product-trials.test.mjs` — two concurrent process-mode stages receive different directories and different ports, and no port is a constant |
| B4 | `test/product-trials.test.mjs` — a process-mode run that times out returns `ETIMEDOUT` and leaves no live descendant: the recorded pid's group is gone, asserted by `process.kill(pid,0)` throwing |
| B5 | `test/container/product-boundary.test.mjs` holds the three isolation tests and is outside the ordinary `test/*.test.mjs` glob; `test/product-trials.test.mjs` asserts it is not collected by the ordinary suite and prints whether the boundary was verified; a separate process-mode test asserts the private grading file sits outside `s.work` without calling it isolation |
| B6 | `test/product-trials.test.mjs` — the live invoker throws on a sandbox with `exec:'process'`, and the container path still emits `--read-only`, `--cap-drop=ALL`, `--network none`, `--security-opt=no-new-privileges` and the unprivileged uid |
| B7 | `.github/workflows/harness.yml` — the `unit` job runs the eight with no Docker install and no image build; the container-boundary job is distinct, runs `test/container/product-boundary.test.mjs`, and its failure fails the build |
