---
status: draft
---
# Intent: the-harness-needs-no-container

- **Date:** 2026-09-11
- **Author:** cwijayasundara
- **Supersedes:** `the-tests-run-without-docker` B5 and B6, which this change reverses. Those
  behaviours are approved and merged at `52e930f`; the reversal belongs here, with
  `supersedes:` in the spec, rather than in an edit to that change.

## Problem

**The harness must not depend on Docker at all.** D3 removed the dependency from the unit and
integration suites; Docker remains in four places, and the decision is to remove all of them:

1. **The live product-trial sandbox.** `evals/lib/invoker.mjs:70-71` — a product invocation runs
   `docker` and wraps the agent in `productDockerArgs`; a non-product invocation already runs
   `claude` directly on the host. 21 `docker` call sites across `evals/lib/` (`stage.mjs`,
   `assertions.mjs`, `campaign.mjs`, `invoker.mjs`, `comparison.mjs`) and `evals/run.mjs`.
2. **The opt-in container-boundary suite.** `test/container/product-boundary.test.mjs` — the three
   OS-isolation assertions D3 deliberately preserved.
3. **The image.** `evals/Dockerfile`, `PRODUCT_IMAGE`, `HARNESS_PRODUCT_IMAGE`.
4. **CI.** The `container-boundary` job in `.github/workflows/harness.yml`, and the
   `HARNESS_PRODUCT_DOCKER` gate it sets.

Documentation in `docs/OPERATING.md:107` and `evals/README.md:56` still describes the container as
the boundary and is already stale after D3.

## Proposed outcome

No `docker` executable, daemon, image or socket is required by anything in this repository, and no
code path invokes one. A clean clone on a machine that has never installed Docker runs every
suite, and `grep -rn docker` over the source returns nothing but history.

Observable from outside the system:

- `node --test test/*.test.mjs` passes with no Docker, as it already does — unchanged by this.
- No file under `test/` requires Docker, and `test/container/` no longer exists.
- CI has no container job, no image build, and no `HARNESS_PRODUCT_DOCKER`.
- No source file references `docker`, `productDockerArgs`, `PRODUCT_IMAGE` or the socket.
- `evals/Dockerfile` is deleted.
- The documentation no longer describes a container boundary that does not exist.

## Affected users and systems

- `evals/lib/invoker.mjs` — the live agent's execution path. **This is the consequential one.**
- `evals/lib/stage.mjs` — `productDockerArgs`, `isolateStage`'s image handling, `PRODUCT_IMAGE`.
- `evals/lib/assertions.mjs`, `evals/lib/campaign.mjs`, `evals/lib/comparison.mjs`,
  `evals/run.mjs` — the container branches D3 added a process branch beside; the container branch
  goes and the process branch becomes the only one.
- `test/product-trials.test.mjs`, `test/invoker.test.mjs`, `test/comparison.test.mjs`,
  `test/container/product-boundary.test.mjs`.
- `.github/workflows/harness.yml`, `evals/Dockerfile`, `docs/OPERATING.md`, `evals/README.md`.
- **Anyone who runs a live product trial**, whose blast radius this change alters.

## Constraints

- Zero dependencies. Replacing Docker with another sandboxing library or binary is not on the
  table — that would trade one dependency for a worse one, and would not be cross-platform.
- `[limits]` unchanged; no new control.
- Nothing may keep the *word* boundary for something that is not one. If a live trial ends up
  unsandboxed, every name, comment and document says so plainly.
- Fixtures under `evals/fixtures/` are untouched.

## Open questions

**One decision belongs to the human, and it is the whole risk of this change.**

**What a live product trial does once there is no container.** A live trial runs a real coding
agent with Write, Edit and Bash against a seeded product. Today that runs inside `--read-only`,
`--cap-drop=ALL`, `--network none`, `--security-opt=no-new-privileges`, an unprivileged uid and
explicit bind mounts. Three options:

1. **A live trial refuses to run.** Removing Docker removes the only boundary, so the live-trial
   path stops rather than silently becoming host execution. The deterministic campaigns, the
   comparison campaigns and every unit and integration test are unaffected — they use a fake
   invoker and already run natively after D3. What is lost is the capable-model product trial,
   which is a research instrument, not part of the build loop. **Recommended.** It removes Docker
   completely and adds no unsandboxed execution path.
2. **A live trial runs the agent directly on the host, behind an explicit flag** that names what
   it does (for example `--no-sandbox`), off by default, printing what is unprotected before it
   starts. Docker is gone; the capability survives; the risk is stated at the point of use and
   accepted per run.
3. **A live trial runs the agent directly on the host by default.** Docker is gone and the
   capability is unchanged in shape, but an agent with Bash executes arbitrary code on the
   operator's machine with their files, their credentials in the environment, and their network.
   **Not recommended**, and named here only so that choosing it is a choice.

The recommendation is 1, with 2 available if capable-model product trials must keep running on
this machine. The consequence to accept explicitly, for any option: **the harness will no longer
contain anything that can honestly be called a sandbox**, and the three OS-isolation tests that
proved one existed are deleted rather than replaced.

A second, smaller question: whether `evals/products.json`'s live task definitions stay in the
repository once nothing can execute them. Recommendation is yes — they are the record of what was
run, and deleting them would lose the comparison history.
