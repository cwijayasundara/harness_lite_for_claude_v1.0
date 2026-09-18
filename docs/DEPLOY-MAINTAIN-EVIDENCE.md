# Phase 6 deploy and maintain evidence

Phase 6 connects existing owners; it does not add a deployment engine or continuous model loop.
`examples/deploy/pipeline-evidence.mjs` reads the event record emitted by an existing pipeline and
checks identity and sequencing. The pipeline still owns builds, credentials, environments,
promotion and rollback.

The deterministic staging rehearsal proves:

- one candidate-bound authorization promotes one identified artifact;
- failed staging smoke evidence cannot precede production promotion;
- healthy production evidence names a positive observation window;
- an unhealthy reversible release records successful rollback;
- an irreversible migration forbids automatic rollback and requires escalation.

The Maintain example now keys diagnoses by environment, release, metric and severity tier. It
persists only the last diagnosis timestamp, applies a configurable cooldown, truncates diagnostic
evidence to five bounded entries, links a triaged intent to its release, and preserves the existing
incident-to-regression-eval and ordinary approved-delivery path.

Evidence commands:

```sh
node --test test/deploy-maintain.test.mjs test/maintain-edge.test.mjs test/release-record.test.mjs
node examples/deploy/pipeline-evidence.mjs pipeline-events.json
```

All environment exercises are disposable local staging simulations. They prove identity,
authorization, transition, rollback and feedback-loop semantics, not access to or successful
deployment in a real production account. Production authority remains human and platform-owned.
