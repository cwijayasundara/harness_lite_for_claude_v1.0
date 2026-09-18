# Compatibility and release support

Plugin version **0.2.0** supports Node.js **22 through 25** and Claude Code **2.1.263 through the
latest compatible 2.x release**. CI exercises Node 22; local release verification also runs on
Node 24. Claude Code 2.1.263 is the pinned minimum used by the integration and subscription smoke
tests. Node 26 and Claude Code 3.x are unverified major upgrades and require a compatibility run
before rollout.

The runtime package is built with `node release/package.mjs --out <directory>` from clean covered
files at an immutable source commit. It contains only the plugin manifests and `.claude/harness`
runtime/configuration inputs. Research docs, history, fixtures, evaluation evidence, examples,
tests, workflows, worktrees and mutable state are excluded. The package itself is committed as a
minimal Git repository so consumer runtime pins remain verifiable.

Install and lifecycle operations:

```sh
claude plugin marketplace add cwijayasundara/harness_lite_for_claude_v1.0
claude plugin install lean-harness-cs-v1@lean-harness-cs-v1 --scope project
claude plugin update lean-harness-cs-v1@lean-harness-cs-v1
claude plugin disable lean-harness-cs-v1@lean-harness-cs-v1
claude plugin uninstall lean-harness-cs-v1@lean-harness-cs-v1
```

After clean install, upgrade or downgrade, restart Claude Code, rerun `harness init`, then require
`doctor --production` and candidate checks. Downgrade restores the prior immutable package/version
and repeats the same initialization; it never edits a pin by hand.

Rollout follows `release/rollout.json`: maintainers first, then early adopters, then general use.
Each cohort must satisfy admission and healthy-window criteria. Any halt criterion stops expansion
and triggers the recorded disable/uninstall/restore procedure. Monthly review uses existing ledger,
latency and production-event evidence and deletes controls only on reliability/redundancy evidence.
