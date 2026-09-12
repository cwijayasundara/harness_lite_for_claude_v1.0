---
status: approved
supersedes: the-tests-run-without-docker#B5, the-tests-run-without-docker#B6
source: https://claude.ai/code/session_01FusCKFhEQq1PmJFUCnhZjv
source_revision: 2026-09-11-decision-remove-docker-completely
source_kind: external-asserted
intent_digest: sha256:55fe4fe320ac3140a9bc6d9eeda3bc1ad7a2ce758c0636022fb72f337af9174f
intent_input_digest: sha256:8dcc3c4ce84871a9ed7ae840a330a2e74133ed77faa57e2350d591864321fbbc
intent_revision: 9f41f5db3167a70b0adcbe43629b6718e0e2a7ba
by: cwijayasundara
at: 2026-09-11T18:29:22.081Z
digest: sha256:3db9760a43a15bab6e7b385754f4a0a6dec1b623dcc7aa45b2dbe4ac29dee271
approval_version: 2
approval_digest: sha256:3101c2eff3f27ceeb677b89ba35470f0df369d355ad309d274401baa18a954a5
---
# Spec: the-harness-needs-no-container

## Outcome

No `docker` executable, daemon, image or socket is required by anything in this repository, and no
code path invokes one.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| Remove the Docker dependency completely | B1, B3 |
| Every suite still runs and passes with no Docker | B2 |
| A live product trial does not silently become unsandboxed host execution | B4 |
| Nothing describes a boundary that no longer exists | B5 |
| One execution path, not a dead branch beside a live one | B6 |

## Observable behaviours

### B1

Given a clean clone on a machine where Docker has never been installed,
When the repository is searched,
Then no source file, test, workflow or document invokes or requires `docker`: no `spawnSync`
of it, no `productDockerArgs`, no `PRODUCT_IMAGE` or `HARNESS_PRODUCT_IMAGE`, no
`HARNESS_PRODUCT_DOCKER`, no `/var/run/docker.sock`, and no `evals/Dockerfile`.

A test asserts this over the tree, so the dependency cannot return quietly.

### B2

Given that same machine,
When `node --test test/*.test.mjs` and `harness check --stage commit` run,
Then they pass, and nothing reports as skipped for want of a container.

This is a regression guard, not new capability: `the-tests-run-without-docker` already made the
suites native. Every assertion that survives this change keeps the meaning it had.

### B3

Given the container-only surface,
When this change lands,
Then `test/container/` and `evals/Dockerfile` are deleted, the `container-boundary` job is
removed from `.github/workflows/harness.yml`, and no CI job installs Docker or builds an image.

The three OS-isolation assertions are **deleted, not relocated and not reimplemented**. Nothing
replaces them, because without a container there is nothing true for them to assert. This
supersedes `the-tests-run-without-docker#B5`, which preserved them as an opt-in suite.

### B4

Given a live product trial, which runs a real coding agent with Write, Edit and Bash,
When it is launched and no container exists to run it in,
Then it refuses to start, naming plainly that it has no boundary and will not execute an agent on
the host. It does not fall back to host execution, and no flag in this change enables one.

This supersedes `the-tests-run-without-docker#B6`, which required a live trial to take the
container path and asserted it could not select the weaker one. There is now no container path;
the property that replaces it is that there is no *unsandboxed* path either. A test asserts the
refusal.

Everything the build loop depends on is unaffected: the deterministic campaigns, the comparison
campaigns and every unit and integration test drive a fake invoker and already run natively.

### B5

Given the documentation and the code,
When either describes how a product trial is contained,
Then it does not, because nothing contains it. `docs/OPERATING.md` and `evals/README.md` stop
describing a container boundary and stop telling an operator that any command exercises
isolation. No name, comment or assertion in the source uses "sandbox" or "isolation" for
something that is neither.

The stale runbook lines D3's review recorded and did not own (`docs/OPERATING.md:107`,
`evals/README.md:56`) are corrected here, where they are in scope.

### B6

Given `evals/lib/stage.mjs`, `assertions.mjs`, `campaign.mjs`, `invoker.mjs`, `comparison.mjs`
and `evals/run.mjs`,
When the container branches are removed,
Then one execution path remains rather than a live branch beside a dead one: the `exec` option
and its `'container'` value are gone, `isolateStage` no longer carries an image, and no function
takes a mode argument with only one legal value.

`native` keeps its existing, unrelated meaning — the native-Claude comparison arm.

## Design

The container branches added by `the-tests-run-without-docker` were deliberately placed beside
the container ones rather than behind a dispatcher, so removal is deletion of the container side
and promotion of the process side, not a rewrite.

`evals/lib/invoker.mjs:70-71` is where the live path is decided today: `sandbox ? 'docker' :
'claude'`. The refusal in B4 replaces the `docker` arm. The existing non-product arm, which
already runs `claude` on the host, is not the subject of this change and is unchanged — it runs
the harness's own evaluator and golden-suite invocations, not a seeded product agent with Bash.

## Out of scope

- Replacing the container with another sandbox (`bubblewrap`, `sandbox-exec`, a VM). That trades
  one dependency for a worse and less portable one, and the zero-dependency rule forbids it.
- Windows support. The repository has many other POSIX assumptions (`ps`, uid/gid, `chmod`,
  `tar`); making it run on Windows is a separate change, not a side effect of this one.
- The behaviour of the harness's own non-product `claude` invocations.
- Deleting `evals/products.json`'s task definitions. They are the record of what was run.

## Safeguards

- **No unsandboxed agent-execution path is created.** B4 is the whole safety content of this
  change: removing the boundary must not silently convert into running without one.
- **Nothing claims a boundary that is gone.** B5, in code and in documentation alike.
- **The isolation tests are deleted, not weakened into something that looks equivalent.** A
  directory is not a sandbox, and neither is a process.
- **No new dependency**, and `[limits]` unchanged.
- **Fixtures under `evals/fixtures/` are untouched.**
- **Accepted consequence, stated once and plainly:** after this change the repository contains
  nothing that can honestly be called a security boundary, and capable-model live product trials
  cannot run on any machine until one exists again.
