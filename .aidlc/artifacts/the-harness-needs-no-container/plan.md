---
status: approved
spec_digest: sha256:3db9760a43a15bab6e7b385754f4a0a6dec1b623dcc7aa45b2dbe4ac29dee271
spec_approval_digest: sha256:3101c2eff3f27ceeb677b89ba35470f0df369d355ad309d274401baa18a954a5
by: cwijayasundara
at: 2026-09-11T18:39:37.414Z
digest: sha256:77802fc5ab5d2ef789ab6e36471b005d5213c6d36e8409137311a54c07a77b41
approval_version: 2
approval_digest: sha256:9feac8a4b813b848aa3e0ce02f4035897fb472f7c624d032781923f27128dbdc
---
# Plan: the-harness-needs-no-container

## Approach

Deletion, not redesign. `the-tests-run-without-docker` put every process branch *beside* its
container branch rather than behind a dispatcher, which was argued at the time as readability and
turns out to be the thing that makes this change small: remove the container arm, promote the
process arm, delete the mode that now has one value.

**The surface, counted.** `evals/lib/assertions.mjs` (11 references), `campaign.mjs` (13),
`invoker.mjs` (4), `stage.mjs` (3), `comparison.mjs` (1), `evals/run.mjs` (1);
`test/product-trials.test.mjs` (8), `test/invoker.test.mjs` (6), `test/comparison.test.mjs` (3);
`.github/workflows/harness.yml` (4); `test/container/product-boundary.test.mjs` (14, deleted
whole) and `evals/Dockerfile` (deleted whole).

**B4 is the only new behaviour, and it is the reason this is not merely a deletion.** Today
`evals/lib/invoker.mjs:70-71` reads `sandbox ? 'docker' : 'claude'`. Deleting the `docker` arm
naively leaves `claude` — which would silently turn every live product trial into an unsandboxed
host execution of an agent with Bash. That is the one outcome the spec forbids. The `sandbox` arm
therefore becomes a refusal that throws, naming that there is no boundary. The `claude` arm for
non-product invocations is untouched: it runs the evaluator and the golden suite, not a seeded
product agent.

**What `exec` becomes.** With the container gone there is one execution path, so `stage()`'s
`exec` option and its `'container'` value go with it (B6). `execNode`, `claimPort`,
`spawnDetachedProcess`, `killProcessGroup` and `productTestArgs` stay and stop being conditional.
`productTestArgs(exec)`/`productTestCommand(exec)` collapse back into plain constants that always
carry `--test-force-exit`, because the reason to withhold it — keeping the container path
byte-identical — no longer exists. `native` is untouched and keeps its unrelated meaning.

**What is deleted rather than replaced.** `test/container/product-boundary.test.mjs` in full. Its
three assertions are true only of a container and there is no honest native equivalent; the spec
is explicit that nothing replaces them. `isolateStage` keeps staging the plugin tree — the tests
still need `s.plugin` — but loses `s.image`, `PRODUCT_IMAGE` and `HARNESS_PRODUCT_IMAGE`.

**Scope of B1's assertion, and the one judgment in this plan.** B1 says "no source file, test,
workflow or document invokes or requires `docker`". The new test asserts that over the
**executable surface** — `evals/`, `test/`, `.aidlc/`, `.github/workflows/`, `.aidlc/harness.toml`
— and not over historical records: `docs/DEFECT-REPAIR-PLAN.md`,
`docs/LEAN-HARNESS-RESEARCH-PROPOSAL.md`, `docs/IMPROVEMENT-PLAN.md`,
`docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md` and `evals/evidence/*.json` describe what was built
and what was measured at the time. Rewriting them to remove the word would falsify the record, and
an eval summary that reports a container run is evidence of a container run. `docs/OPERATING.md`
and `evals/README.md` are different: they are runbooks, they tell an operator what to do now, and
B5 puts them in scope.

Alternative considered and rejected: keeping `productDockerArgs` unused "in case Docker comes
back". Dead code that names a boundary is how a repository ends up claiming one it does not have,
and `git revert` is the real answer.

## Files

- `evals/lib/stage.mjs`
- `evals/lib/assertions.mjs`
- `evals/lib/campaign.mjs`
- `evals/lib/invoker.mjs`
- `evals/lib/comparison.mjs`
- `evals/run.mjs`
- `evals/Dockerfile`
- `evals/README.md`
- `test/product-trials.test.mjs`
- `test/invoker.test.mjs`
- `test/comparison.test.mjs`
- `test/container/product-boundary.test.mjs`
- `test/no-container.test.mjs`
- `.github/workflows/harness.yml`
- `docs/OPERATING.md`
- `CODEBASE-MAP.md`

## Order

1. Add the failing test first: `test/no-container.test.mjs` asserts no `docker`,
   `productDockerArgs`, `PRODUCT_IMAGE`, `HARNESS_PRODUCT_DOCKER` or `docker.sock` anywhere in the
   executable surface (B1), and that a live product trial refuses rather than running on the host
   (B4). Both fail against current code.
2. `evals/lib/invoker.mjs`: replace the `sandbox` arm with the refusal. B4 goes green. This is
   done first and alone, so no intermediate commit can run an agent unsandboxed.
3. `evals/lib/stage.mjs`: delete `productDockerArgs`, `PRODUCT_IMAGE`, `s.image` and the `exec`
   option; collapse `productTestArgs`/`productTestCommand` to constants carrying
   `--test-force-exit`; keep `isolateStage`'s plugin staging.
4. `evals/lib/assertions.mjs`, `campaign.mjs`, `comparison.mjs`, `evals/run.mjs`: delete each
   container arm and promote its process arm; drop the `s.exec` conditionals and the
   `dataFile` branch, keeping the host `ENOTDIR` path.
5. `git rm evals/Dockerfile` and `git rm test/container/product-boundary.test.mjs`.
6. `test/product-trials.test.mjs`, `test/invoker.test.mjs`, `test/comparison.test.mjs`: drop the
   container assertions, keep every other assertion each carries, and remove `{exec:'process'}`
   now that it is the only path.
7. `.github/workflows/harness.yml`: delete the `container-boundary` job.
8. `docs/OPERATING.md` and `evals/README.md`: remove the container-boundary description and the
   commands that claim to exercise isolation; state what actually runs.
9. Full suite on a machine with no `docker` on `PATH`; `--stage stop`; `--stage commit`.
10. Regenerate `CODEBASE-MAP.md`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/no-container.test.mjs` — asserts no `docker`, `productDockerArgs`, `PRODUCT_IMAGE`, `HARNESS_PRODUCT_DOCKER` or `docker.sock` under `evals/`, `test/`, `.aidlc/`, `.github/workflows/` or `.aidlc/harness.toml`; `evals/Dockerfile` and `test/container/` do not exist |
| B2 | `node --test test/*.test.mjs` and `harness check --stage commit` on a machine with `docker` absent from `PATH`, run and pasted; nothing reports as skipped for want of a container |
| B3 | `test/no-container.test.mjs` asserts `evals/Dockerfile` and `test/container/product-boundary.test.mjs` are absent; `.github/workflows/harness.yml` contains no `container-boundary` job, no image build and no `HARNESS_PRODUCT_DOCKER` |
| B4 | `test/no-container.test.mjs` — a product invocation throws a refusal naming the absent boundary, and does not spawn `claude`; the non-product path still invokes `claude` unchanged, asserted alongside so the refusal cannot be over-broad |
| B5 | `docs/OPERATING.md` and `evals/README.md` contain no container-boundary description and no command claiming to exercise isolation; `test/no-container.test.mjs` asserts neither runbook names `HARNESS_PRODUCT_DOCKER` |
| B6 | `test/no-container.test.mjs` asserts `stage()` accepts no `exec` option and `evals/lib/stage.mjs` exports no `productDockerArgs`; the existing suite exercises the single remaining path |
