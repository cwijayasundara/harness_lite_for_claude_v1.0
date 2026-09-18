# Production readiness contract

The default runtime has one job: make safe, verified Claude Code work the easiest path, including
informal “vibe coding” sessions. Workflow artifacts improve alignment, but quality enforcement does
not depend on a user remembering to invoke them.

## Default runtime

- Six focused skills: intent, spec, design, plan, implement, and diagnose.
- Two read/report quality agents: evaluator and verifier.
- Four hook bindings:
  - SessionStart injects the current change and quality command.
  - PreToolUse guards writes and dangerous shell/release actions.
  - PostToolUse runs fast sensors after each edit.
  - Stop runs fast sensors plus tests narrowed to the changed files.
- CI runs the complete candidate-bound check and is the authoritative merge signal.

Graph, map, pack, autonomous delivery, coordination, model campaigns, and production diagnosis are
optional capabilities. They do not run in the interactive hook path and must earn default status
through comparative evidence.

## Project admission gate

A project is production-ready only when `harness doctor --production` passes with live commands for every required
sensor profile and the candidate-bound CI workflow passes. At minimum:

- behaviour: full tests and a changed-test command;
- QA: formatter, lint and/or type checking appropriate to the language;
- hardening: secret scanning plus the project's dependency/security check;
- architecture: an executable boundary check for systems where architectural drift is material.

An empty command is an explicit `SKIP`, never a pass. A temporary exception is committed beside
the sensor configuration and names exactly one failing profile or required command:

```toml
[waivers.architecture]
reason = "Legacy boundary migration tracked in ENG-1234"
owner = "platform-team"
expires = "2026-10-01T00:00:00Z"
```

`doctor --production` shows active waivers. Missing reason/owner, unreadable or expired dates,
unknown targets, and waivers whose target is already healthy all fail admission. Review happens
through the ordinary code-review protection on this committed policy; the harness does not invent
a second approval identity or waiver database.

## Evidence required before broad rollout

Run a controlled pilot against native Claude Code plus the same project CI. Join every change by a
stable change ID and report:

- idea-to-spec, spec-to-plan, plan-to-PR, review, merge-to-deploy, and incident-to-intent time;
- human active minutes per accepted production change;
- first-pass CI, repair cycles, review findings, change failure and rollback rate;
- model, CI and human cost per accepted production change;
- quality-adjusted throughput and lead time to a healthy production deployment.

Use at least 20 completed changes per arm for a directional decision, stratified by repository,
risk and task type. Test optional modules independently. A module becomes default only when it
improves speed, human effort, quality or cost without materially worsening another primary outcome.

`harness metrics` reports `unmeasured` until evidence is sufficient. It now derives intent-to-spec
and spec-to-plan time from first Git commits, alongside first-pass checks, plan-to-PR, rework,
escaped defects, eval contribution and delivered changes.
