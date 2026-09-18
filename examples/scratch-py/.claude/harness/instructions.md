# shortlink

## AIDLC workflow

Run `.claude/harness/bin/harness status` and resume the current change:

`intent -> spec (gate 1) -> plan (gate 2) -> implement -> review -> merge (gate 3)`

Keep each change under `.claude/harness/artifacts/<slug>/`: intent.md explains the outcome;
spec.md defines behavior and design; plan.md names owned files and proof; review.md
records findings and verification. Use the matching skills supplied by the shared plugin.

The human approves the spec and plan and authorizes merge. Approval records must be committed
before implementation; never approve your own work. Ask when a consequential requirement or
scope decision is unresolved. Make routine choices inside the approved scope without another gate.

The line between the two is whether you can state the success condition. "Make the export better",
"clean this up", "improve the API" name no observable outcome — a choice made there is the
requirement, not an implementation detail, and guessing it produces work nobody asked for. Ask one
short question and wait. Inside an approved scope, where the outcome is already written down, the
remaining choices are yours and asking about them wastes a turn.
When verified work is delivered, close its intent with `status: closed`.

## Commands

G16: each line says what healthy output looks like, because "run the checks" without that is an
instruction whose result nobody can grade.

```
.claude/harness/bin/harness status                        # the current change and its approvals
    healthy: one row per open change; "next" names the step, no ERROR lines
.claude/harness/bin/harness doctor                        # the commands this project configured
    healthy: every verb your toolchain provides reads "set"; "skipped" means no command
.claude/harness/bin/harness check --stage fast --changed  # seconds; run it as you work
    healthy: PASS or SKIP on every line, exit 0
.claude/harness/bin/harness check --stage stop            # the full suite; run it before saying "done"
    healthy: PASS test, exit 0. A SKIP on test means no test command is configured
.claude/harness/bin/harness check --stage commit          # + scope, budget, tamper and the ratchets
    healthy: exit 0. FAIL scope-drift means a file no approved plan names was changed
.claude/harness/bin/harness new <slug>                    # create a change's artifacts
.claude/harness/bin/harness deliver <slug> --live         # implement, check, review, repair, PR
    healthy: every phase recorded, and a pull request URL at the end
```

Invoke these commands for the user. Approval is the human's gate through
`.claude/harness/bin/harness approve <slug> spec|plan --by <identity>`, followed by a commit.

## Verification

Never report a task complete without running `--stage stop` yourself and pasting its output. Not
"the tests should pass" and not "I ran the tests" — the output, in the message that claims the
work is done. A claim with no output behind it is the one failure mode this whole harness exists
to make expensive.

If a check cannot run here, say which one and why. An unavailable tool is a fact to report, never
a reason to describe the work as verified. If a check fails and you believe the check is wrong,
say that too, and leave it failing: weakening a test or raising a threshold to get a green line is
the one repair that is never yours to make.

## Releasing and rolling back

A deploy to a live environment needs a current release record: `harness release approve --by
<identity>` authorises **this commit** for a while (60 minutes by default), and the bash guard
refuses a release without one. `harness release revoke` ends it early, and `harness release status`
says what is authorised and until when. The agent cannot run the approve command — it is the
human's, like every other gate.

Rollback: <replace this line with the one command that puts the previous release back, so nobody
has to reconstruct it at three in the morning>

## Project setup

Configure this project's commands in `.claude/harness/harness.toml`. Empty capabilities are skipped,
not verified. Tests belong to this application; the harness development eval suite is separate.
The shared plugin supplies the implementation. Do not copy its source, development history,
evaluation results or example projects into this repository.

## Project conventions

<!-- Generated from .claude/harness/instructions.md; edit the canonical file and run harness init. -->


## AIDLC workflow

Run `.claude/harness/bin/harness status` and resume the current change:

`intent -> spec (gate 1) -> plan (gate 2) -> implement -> review -> merge (gate 3)`

Keep each change under `.claude/harness/artifacts/<slug>/`: intent.md explains the outcome;
spec.md defines behavior and design; plan.md names owned files and proof; review.md
records findings and verification. Use the matching skills supplied by the shared plugin.

The human approves the spec and plan and authorizes merge. Approval records must be committed
before implementation; never approve your own work. Ask when a consequential requirement or
scope decision is unresolved. Make routine choices inside the approved scope without another gate.
When verified work is delivered, close its intent with `status: closed`.

## Commands

```
.claude/harness/bin/harness status                       # current change and approval state
.claude/harness/bin/harness new <slug>                   # create a change's artifacts
.claude/harness/bin/harness doctor                       # configured project commands
.claude/harness/bin/harness check --stage fast --changed  # configured fast checks
.claude/harness/bin/harness check --stage stop            # project tests before completion
.claude/harness/bin/harness check --stage commit          # tests, approved scope and other checks
```

Invoke these commands for the user. Approval is the human's gate through
`.claude/harness/bin/harness approve <slug> spec|plan --by <identity>`, followed by a commit.
Never report a task complete without running and pasting the output of `--stage stop` yourself.

## Project setup

Configure this project's commands in `.claude/harness/harness.toml`. Empty capabilities are skipped,
not verified. Tests belong to this application; the harness development eval suite is separate.
The shared plugin supplies the implementation. Do not copy its source, development history,
evaluation results or example projects into this repository.

## Project conventions

Replace this section with the few conventions, architecture facts and recurring mistakes that
matter here. Keep instructions concise and current. Deployment and monitoring are project-owned.
