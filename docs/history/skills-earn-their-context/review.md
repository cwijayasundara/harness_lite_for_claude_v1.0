---
status: draft
---
# Review: skills-earn-their-context

Written by the evaluator against `spec.md` and `.aidlc/policies/review.md`. Every finding cites a
behaviour id or a review pass, and carries a severity.

## Skill review (B1)

Taken 2026-09-08 against the seven skills at `89b5c20`. One criterion, applied
to each: does the skill say something specific to this harness, or is it generic
guidance carrying recorded evidence? "A capable agent can follow it" is not
evidence and does not appear as a reason below.

| Skill | Criterion met | Evidence |
|---|---|---|
| `intent` | Specific | Names `harness new <slug>`, `harness status --change <slug>` and the distinction between intake, selection and approval; carries the one-outcome-per-intent rule the `parent` / `source_revision` / acceptance-criteria mapping depends on. Nothing outside this repository defines these. |
| `spec` | Specific | Names the permanent `### B<n>` ids that the plan's proof table, `scope-drift`'s `unkept-proof` rule and every review finding cite, and the `supersedes:` frontmatter that approval refuses when the link appears only in prose. |
| `plan` | Specific | Names `## Files` as the only declaration of ownership — `.aidlc/checks/scope-drift.mjs:58` and the write guard read that section and nothing else — and the `stale-approval` semantics that stop an edited plan widening its own scope. |
| `implement` | Specific | Its frontmatter is load-bearing: `model: claude-sonnet-5` must equal `[models].generator` or `test/contracts.test.mjs:329` fails, and `context: fork` is what makes the generator a separate context from the evaluator. Names `harness check --stage stop` and the selection requirement. |
| `map` | Specific, with measured evidence | Names the five graph questions held by `test/graph.test.mjs` and `CODEBASE-MAP.md`. Carries the only measured number in any skill: 3,397 tokens against 97,995 for the naive reads answering the same golden queries, at 90% recall, with `evals/bench/pack-bench.mjs` failing if either slips — and it states its own limit, that the comparison is against naive reads and not competent targeted search. |
| `diagnose` | Partly | Specific: the loop built from `bash .aidlc/bin/harness check`, and the incident path — `harness new incident <slug>`, control-band breach, linked intent, one permanent eval — which is the loop `examples/maintain/band-to-intent.mjs` implements. Generic and unevidenced: the four phases and `## Anti-patterns`. No record says an agent got any of this wrong without the skill. |
| `change-safely` | Partly | Specific: graph-first lookup with Grep as the miss path, test locks and external evaluation fixture ownership, the approved `## Files` boundary, `supersedes`/`extends` continuity, and revision-specific product context. Generic and unevidenced: the situation/approach table and the surrounding characterisation and refactor prose. |

### Findings the review turned up

**F1 — `README.md:233` names a skill that has not existed since `3332615`.**
"refactor this" is said to pull in `pure-refactor`, which was replaced by
`change-safely`. Fixed under B3. `docs/BUILD-PLAN.md:359` also names it, as part
of its account of the original twenty, and is history rather than a claim about
what ships.

**F2 — `change-safely`'s specific content is almost entirely a second copy.**
Six of its seven project-specific rules are already stated where the agent
meets them: graph-first lookup in `map` and again in `implement`; test locks,
external fixture ownership and the `## Files` boundary in `implement`;
`supersedes` and `extends` in `spec`; revision-specific product context in
`map`. Only "fix implementation bugs to meet the approved requirement rather
than synchronizing the bug into it" has no second home, and it is one sentence.

**F3 — what remains in `change-safely` is the residue of one simplification
pass, not a considered body of guidance.** `simplify-daily-guidance` at
`6d76857` cut 63 lines, removing the concrete Pin / Sprout / Refactor procedures
and the coverage table with them, and left generic prose in their place. The
generic half has therefore never been asked to justify itself; it survived a
pass aimed at something else.

**F4 — `diagnose`'s oldest layer predates every lean-era spec.**
`## Anti-patterns` arrived at `303b58b`, before the lean rewrite, names nothing
in this repository, and no recorded defect motivates it. Cut under B2.

### Recommendation, not taken here

`change-safely` is a candidate for deletion, and F2 and F3 are the argument: one
unduplicated sentence, and a generic remainder that no defect and no eval
supports. Deleting it would free one place against the ceiling. Three
consequences make it the human's decision rather than this change's: the
unduplicated sentence needs a home, `harness init` consumers who have matched on
its description would lose the match, and an unevidenced deletion is the mirror
of the unevidenced addition this row objects to. `diagnose` is not a comparable
candidate — its incident path has no second home anywhere.

## Findings

| Severity | Cites | Finding |
|---|---|---|

## Evidence and uncertainty

<Checks actually observed, unverified paths and limits of the review. Do not claim tests ran
without evidence. The caller runs checks separately from the evaluator.>

## Recommendation

<approve | changes-requested, and why in one sentence.>

## Design and delivery context

Classify discrepancies as authorized rule changes, preserved-behavior refactors, or bugs to fix
against the approved contract. Cite source/behavior and design references at exact revisions.
Inspect `harness graph query product --revision <commit>` where delivery records exist; retain
unknown coverage and conflicts. Approval is a proposal, integration is repository state, and
neither establishes deployment. Do not infer executed proof from a filename or graph edge.
