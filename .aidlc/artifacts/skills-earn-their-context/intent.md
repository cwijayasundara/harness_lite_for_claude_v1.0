---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 89b5c20f6f54dfe06720fd38cb09e69e977d6443
parent: lean-review-skills-and-roles
---
# Intent: skills-earn-their-context

- **Date:** 2026-09-08
- **Author:** Claude, recording the user's request to take the lean-review skills
  and roles row through the AIDLC workflow
- **Source:** Lean review, 8 September 2026 in `docs/IMPROVEMENT-PLAN.md`, fourth
  disposition row: skills and roles.

## Problem

Seven skills sit exactly at the registry ceiling, and nothing records which of
them earn their place or on what evidence.

Five do. `intent`, `spec`, `plan` and `implement` are this harness's contract
chain and cannot be inferred: they name `harness new`, `harness approve`, the
permanent `### B<n>` ids the proof table and every review finding cite, the
`## Files` section that `scope-drift` and the write guard read and nothing else,
and the stale-approval semantics that stop a plan widening its own scope. `map`
is equally specific and carries measured evidence — 3,397 tokens against 97,995
for the naive reads answering the same golden queries, at 90% recall, with
`evals/bench/pack-bench.mjs` failing if either number slips.

Two do not clear that bar. `diagnose` and `change-safely` are a generic
debugging recipe and a generic safe-refactor recipe wrapped around a thin
project-specific core. Their oldest layer predates the lean rewrite: the
`## Anti-patterns` section arrived at `303b58b`, before any lean-era spec, and
no recorded defect says a capable agent guessed wrong without it. Their standing
argument is that an agent can follow them, which the review says is not
evidence. `simplify-daily-guidance` already trimmed both once, so the remaining
generic prose is what survived one pass without ever being asked to justify
itself.

The review's own defect is visible in the guidance: `README.md:233` tells a
reader that "refactor this" pulls in `pure-refactor`, a skill that has not
existed since `3332615` replaced it with `change-safely`. A description of the
inventory that nobody checked against the inventory is the same failure as the
index that answered `renderWiki` from a deleted file for eleven days.

Nothing states the limit. The ceiling reads as a target rather than a spent
budget, and the next plausible step is the one v6 took — an installable pack or
overlay of skill bundles, defensible one bundle at a time and a distribution
subsystem in aggregate.

## Proposed outcome

The seven skills are reviewed against one stated criterion — guidance specific
to this harness, or generic guidance with recorded evidence — and the result is
recorded per skill. Generic prose that meets neither test is removed; every
project-specific rule, and every rule an approved spec installed, survives
unchanged. The README names skills that exist.

The limit is stated where a reader meets it and held by a test: a skill enters
only with a failing eval or a defect recorded while building an application
through the harness, the ceiling is not raised to admit one, and there is no
pack, bundle, overlay or marketplace mechanism for distributing skills into a
project beyond the single kernel plugin already shipped.

Whether `diagnose` or `change-safely` should exist at all is answered in
`review.md` as a recommendation with its evidence. Deleting a skill is the
human's decision and is not taken here.

## Affected users and systems

Agents, which load skill descriptions every session and skill bodies on match;
engineers reading `README.md` to learn what the harness ships; projects running
`harness init`, which inherit these seven against their own ceiling.

## Constraints

- Do not add or delete a skill, and do not change `[limits]` in either direction.
- Do not add a control, hook binding, agent, sensor or CLI verb.
- Keep each skill's `name` and third-person `description`, its 130-line stop,
  and no numbered sequence longer than eight steps — `test/contracts.test.mjs`
  holds all three.
- Preserve every instruction an approved spec placed in these files:
  graph-first lookup (`graph-first-retrieval`), revision-specific product and
  design context (`product-design-context`), and the boundaries kept by
  `simplify-daily-guidance` — test locks, approved file scope, external
  fixture ownership, and `supersedes`/`extends` continuity.
- Do not restate a budget number in prose.
- Do not edit another change's approved artefacts.

## Open questions

None
