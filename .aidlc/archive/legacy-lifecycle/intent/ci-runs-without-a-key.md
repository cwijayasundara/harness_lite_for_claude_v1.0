# Intent: ci-runs-without-a-key

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T15:55:32.748Z
- **Author:** cwijay@biz2bricks.ai
- **Status:** approved <!-- draft | approved | closed -->
- **Source:** conversation, 2026-08-24 — "whats the use of the code in the .github? I see most
  of these are failing"

## Problem

Every push to `main` turns the Actions tab red, and has done since CI was added. `harness.yml`
has never once passed: five runs, five failures. The owner does not read the result, because
the result has never carried information.

Four separate causes are tangled together, so no single fix makes the signal usable:

1. `harness-intent.yml` is not a valid workflow file. It fails in 0 seconds on every push and
   appears in the run list under its file path instead of its name — GitHub's signature for a
   file it could not parse. It has therefore never done its job even once.
2. The `unit` job fails one assertion: `test/invoker.test.mjs:103` requires the `claude` CLI
   to be on `PATH`. It is on the owner's laptop and is not on a GitHub runner. 104 tests pass,
   1 fails, and the one that fails grades the machine rather than the change. The repo already
   knows this is wrong — `.claude/CLAUDE.md` names it under "Things this project gets wrong",
   and `test/evals.test.mjs:131` already does the right thing for `ruff`/`pytest`.
3. The `cost` job dies before it measures anything: `MODULE_NOT_FOUND`. It runs the harness
   binary by a path relative to `examples/scratch-py`, which has no `bin/`.
4. Six workflows call `anthropics/claude-code-action` with `secrets.ANTHROPIC_API_KEY`. The
   repository has no secrets configured at all, so the key is empty. `harness-triage` fires on
   every `harness` failure and then fails itself, doubling the red on every push.

The owner does not intend to add an API key to this repository, and does not want any
model-driven workflow to execute on GitHub.

## Proposed outcome

On a repository with no `ANTHROPIC_API_KEY` and no other secret configured, a push to `main`
produces a run list in which every workflow either **passes** or is **skipped**. Nothing is
red. From that point a red run means the change is broken — which is the only condition under
which anyone will look at it again.

Two properties have to hold for that to be worth anything:

- No job that would call a model starts at all. Not attempted-and-failed, not
  attempted-and-tolerated: never started, and reading no key.
- The jobs that do run still fail when they should. Deleting or muting a check to get green is
  the failure mode this outcome must not be satisfied by.

## Affected users and systems

- The repository owner, who currently has no working CI signal on any change.
- `.github/workflows/` — eleven files; `.github/ISSUE_TEMPLATE/intent.yml` is unaffected.
- `test/invoker.test.mjs` and `examples/scratch-py`, both reached only through CI.
- The non-engineer intake path (issue labeled `intent` → draft `intent.md` PR). Half of it is
  deterministic and needs no key; today the whole file is dead because of cause (1).

## Constraints

- **No `ANTHROPIC_API_KEY` is added to this repository.** Decided by the owner, 2026-08-24.
- The model-driven workflow files are kept, not deleted. They are the worked reference for the
  harness's model seams, and re-enabling them later should cost one repository variable plus
  the secret. Decided by the owner, 2026-08-24.
- The deterministic half of `harness-intent.yml` stays live and key-free. Decided by the
  owner, 2026-08-24.
- Zero dependencies for the harness itself: the Node suite must still run on a cold clone with
  no `node_modules`.
- No check may be weakened, deleted, or have its threshold raised to reach green.

## Open questions

1. **How should the `cost` job get a comparable environment?** `check_stop_tokens` measures
   the rendered output of `examples/scratch-py`'s own checks, so it moves when the Python
   toolchain moves. The committed baseline (18 tokens) was captured with a complete toolchain;
   on this laptop it reads 212 because `pytest-json-report` is absent, and a GitHub runner has
   neither `ruff` nor `pytest`. Either CI installs that toolchain, or the metric is marked
   `n/a` when the toolchain differs. *Answered in the spec, with evidence from a real run —
   not by preference.*
2. **Does `baseline.compare`'s existing `n/a` path actually cover this?** It keys off controls
   whose verdict is `errored`, and a present-but-misconfigured `pytest` is currently graded
   `fail`, not `errored`. If that classification is the real gap, it is a defect in
   `runner.mjs`/`normalize.mjs` and may belong to its own intent rather than this one.
   *Answers to: whoever writes the spec, after reading the classification.*
3. ~~**Is `harness-protection.yml` in scope?**~~ **Answered by the owner, 2026-08-24: no.**
   It is `workflow_dispatch`-only and never contributes to the red. It stays exactly as it is,
   and a human who clicks Run without `HARNESS_ADMIN_READ_TOKEN` still gets a failure. That is
   an accepted, hand-triggered cost, not a broken signal.
4. ~~**What is the fate of the three `INVALID` chains already on `main`?**~~ **Answered by the
   owner, 2026-08-24: a separate intent.** `docs-to-repo-root`,
   `supporting-artefacts-to-root` and `empty-suite-is-not-a-pass` are out of scope here and
   must not be repaired opportunistically inside this change — a CI fix that also rewrites
   three unrelated artifact chains is a diff no one can review.
