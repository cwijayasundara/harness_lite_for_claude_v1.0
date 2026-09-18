# Guidance experiments

One hypothesis per section, in the order they should be tried. `evals/experiment.mjs` takes the
first section without `status: done`, makes that one change, runs the golden suite, and keeps the
commit on a branch only if the score beat the previous measured run. The score is the fraction of
golden tasks that passed — not the contribution mean delta, which needs the paired native campaign
and costs too much to run nightly.

Written by a person, on purpose. A loop that invented its own hypotheses would be optimising
against its own taste, and the thing being steered is the same kind of model that would be doing
the inventing.

Each section needs a `file:` line naming exactly one file, and it must be in the steering set —
`.claude/harness/instructions.md`, `.claude/harness/skills/`, `.claude/harness/roles/`, `.claude/harness/policies/`, and the project
instructions template. Anything else is refused before the run starts: an experiment that could
edit the runner, the tasks or a fixture could produce its own result.

Add `status: done` when an experiment has been tried, whatever the outcome. The row in
`evals/experiments.tsv` is the record; this file is the queue.

## Name the miss path before the index

file: .claude/harness/instructions.md

The graph section leads with the five questions and mentions grep as the miss path afterwards.
Measured worry: a model that has been told to ask the index first treats a miss as "it does not
exist" rather than as "grep now". Try putting the miss path in the first sentence and see whether
the tasks that depend on finding things in unfamiliar code move.

## State the refusal before the remedy

file: .claude/harness/skills/implement/SKILL.md

The implement skill explains what may change about a test before it says what may not. Try the
reverse order — the prohibition first, then the legitimate maintenance — and see whether
`test-integrity` and `surgical-fix` hold at the same rate with a shorter skill.
