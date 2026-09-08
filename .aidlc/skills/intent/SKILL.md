---
name: intent
description: Turns a conversation, a PRD, or a vague request into a version-controlled intent.md — the problem, the outcome, the constraints, and the questions that block progress. This skill should be used whenever someone describes something they want built or changed and no intent file exists yet, including when they paste a PRD or a ticket. Start here rather than jumping to a plan.
---

# Capture the problem and outcome

Read the request and relevant code, tests and documentation first. Establish who is affected,
what fails today, the desired outcome and real constraints. Keep the intent concise; design
belongs in the spec and implementation scope belongs in the plan.

Use `harness new <slug>` to create the artifact chain. Record the source and any decisions
already made. Capturing backlog work does not select it for execution. Use
`harness status --change <slug>` when this is the change the worktree will execute; selection
is not intake acceptance or approval. Ask only unresolved questions whose answers could materially change behaviour,
design, safeguards or scope. Group closely related questions when that makes them easier to
answer. Resolve repository facts by reading the repository. A sufficiently clear request or
PRD needs no interview; write `None` under Open questions when none block progress.

One intent may cover related behaviours that deliver one coherent outcome. Split independent
outcomes when their approval or delivery should be separate, regardless of the word "and".
Do not invent questions, constraints or separate changes to fill a template.

Confirm intent when consequential ambiguity remains. Spec and plan still require human approval
through the ordinary gates before implementation. In automated trials, return control to the
external driver for a labelled simulated decision. Never fabricate approval or approve your
own gates. Existing explicit human authorization is context to preserve, not a reason to ask
for the same decision again; record its source without claiming a separate human CLI event.

For several bounded outcomes under one initiative, reference the stable parent and exact
source revision in each intent. Keep the complete acceptance inventory in the source, not a
duplicate parent registry. Map source criteria to child behaviours; surface unmapped criteria
in status. A sprint or assignee change does not rename the outcome. Optional tracker, assignee,
iteration and assignment_observed_at fields are locally recorded, unverified projections.
Change assignments in the existing tracker and record the tracker URL; no local status can
certify remote allocation. Inspect a revision with `git show` and `git grep`.
