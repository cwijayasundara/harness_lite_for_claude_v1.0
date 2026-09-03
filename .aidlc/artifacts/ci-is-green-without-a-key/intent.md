---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: ci-is-green-without-a-key

- **Status:** approved
- **Author:** cwijayasundara

## Problem

Every push to `main` turns the Actions tab red, and has since CI was added. A result that has
never carried information is one nobody reads, which means CI is currently not a control at all —
it is decoration that costs minutes.

This restates `ci-runs-without-a-key`, whose intent was approved on 2026-08-24 and whose spec was
never sealed. That spec named four causes. Measured today, three are already fixed and the spec
would have had us re-fix them:

- **`harness-intent.yml` is unparseable.** It parses: `name`, `on` and `jobs` are all present and
  well-formed.
- **The unit job fails without the `claude` CLI on PATH.** It does not. Run with a PATH holding
  node and no `claude`, the suite reports 212 tests, 0 failures — `test/invoker.test.mjs`
  installs a stub rather than requiring the real binary.
- **The cost job dies with `MODULE_NOT_FOUND`.** It does not. Run against `examples/scratch-py`
  with no `ruff` and no `pytest`, `baseline check` reports
  `SKIP check_stop_tokens 18 -> 112 (toolchain differs (fmt, lint vs none))` and exits zero.

What remains is the fourth cause, unchanged and untouched:

- **Six workflows call `anthropics/claude-code-action` or pass `ANTHROPIC_API_KEY`, and not one
  of them is gated.** `claude-fix`, `claude-review`, `harness-diagnose`, `harness-intent`,
  `harness-triage`, and the `evals` job of `harness`. The repository has no secrets configured, so
  the key is empty and each fails. `harness-triage` fires on every `harness` failure and then
  fails itself, doubling the red on every push.

## Outcome

On a repository with no `ANTHROPIC_API_KEY` and no variables set, a push to `main` produces a run
list in which every workflow passes or is skipped. From that point a red run means the change is
broken, which is the only condition under which anyone looks again.

## Affected systems

The six workflow files above, and a test that keeps the guarantee true as workflows are added.

## Constraints

Two properties decided by the owner on 2026-08-24 and unchanged:

- **No `ANTHROPIC_API_KEY` is added to this repository**, including a dummy value.
- **The model-driven workflow files are kept, not deleted.** They are the worked reference for the
  harness's model seams, and re-enabling them should cost one repository variable plus the secret.

No job that would call a model may start at all — not attempted-and-tolerated, not
started-and-exited-early. GitHub must skip it before allocating a runner.

Green must not be reached by deleting or muting a check. Every job that does run must still fail
when it should.

## Open questions

Two consequences the owner already accepted and which this does not change: with the switch off,
nothing reviews a diff against its contract before merge, and a change to a steering surface
merges with no eval evidence. Both are recorded as deviations in `docs/PLAYBOOK-CONFORMANCE.md`.
