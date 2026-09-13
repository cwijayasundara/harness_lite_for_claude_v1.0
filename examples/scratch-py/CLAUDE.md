<!-- Generated from .aidlc/instructions.md; edit the canonical file and run harness init. -->
# shortlink

## AIDLC workflow

Run `.aidlc/bin/harness status` and resume the current change:

`intent -> spec (gate 1) -> plan (gate 2) -> implement -> review -> merge (gate 3)`

Keep each change under `.aidlc/artifacts/<slug>/`: intent.md explains the outcome;
spec.md defines behavior and design; plan.md names owned files and proof; review.md
records findings and verification. Use the matching skills supplied by the shared plugin.

The human approves the spec and plan and authorizes merge. Approval records must be committed
before implementation; never approve your own work. Ask when a consequential requirement or
scope decision is unresolved. Make routine choices inside the approved scope without another gate.
When verified work is delivered, close its intent with `status: closed`.

## Commands

```
.aidlc/bin/harness status                       # current change and approval state
.aidlc/bin/harness new <slug>                   # create a change's artifacts
.aidlc/bin/harness doctor                       # configured project commands
.aidlc/bin/harness check --stage fast --changed  # configured fast checks
.aidlc/bin/harness check --stage stop            # project tests before completion
.aidlc/bin/harness check --stage commit          # tests, approved scope and other checks
```

Invoke these commands for the user. Approval is the human's gate through
`.aidlc/bin/harness approve <slug> spec|plan --by <identity>`, followed by a commit.
Never report a task complete without running and pasting the output of `--stage stop` yourself.

## Project setup

Configure this project's commands in `.aidlc/harness.toml`. Empty capabilities are skipped,
not verified. Tests belong to this application; the harness development eval suite is separate.
The shared plugin supplies the implementation. Do not copy its source, development history,
evaluation results or example projects into this repository.

## Project conventions

Replace this section with the few conventions, architecture facts and recurring mistakes that
matter here. Keep instructions concise and current. Deployment and monitoring are project-owned.
