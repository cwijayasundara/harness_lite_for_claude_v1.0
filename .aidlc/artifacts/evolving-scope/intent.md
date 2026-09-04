---
status: draft
---
# Intent: evolving-scope

- **Date:** 2026-09-04
- **Author:** cwijayasundara
- **Source:** conversation 2026-09-04

## Problem

Every one of the twenty-two golden tasks is a single prompt against a fixture that was built for
it. Nothing in the suite asks the question the harness actually exists to answer: does it still
hold on the fourth change to the same code, when the requirement that arrives contradicts the one
that was approved two sprints ago?

Three specific blind spots.

**Scope is never unknown.** Every fixture is shaped for the prompt it receives. A real project
knows sprint one and guesses at the rest, and the guess is wrong. Nothing measures what happens
when sprint two's requirement means sprint one's spec is now partly false.

**Artifacts never evolve.** A change is a slug directory and the slug directories are islands.
When sprint two supersedes a behaviour approved in sprint one, nothing records it: the old spec
still says `status: approved` and still describes behaviour the code no longer has. SPDD's
correction is "when reality diverges, fix the prompt first, then update the code", and the
harness has no way to express that a prompt was corrected. `stale-approval` catches an artifact
edited after approval; it says nothing about an artifact made false by a *different* change.

**Brownfield is untested and probably broken.** `legacy-untested` exists as a fixture, but the
harness has never been installed into a repository that already had code and no artifacts. On
day one there is no approved plan, so `require_contract` refuses the first product write, and
nothing describes what the existing code already does. This is not an edge case: a greenfield
project becomes brownfield the moment sprint one lands, so every sprint after the first is a
brownfield sprint against the harness's own output.

None of this can be tested by hand. The failure mode is cumulative and only shows on the third or
fourth pass, which is exactly the pass a person stops doing carefully.

## Proposed outcome

The suite runs multi-sprint campaigns. A campaign gives the agent one sprint's requirement at a
time, never the whole product, and asserts after each sprint that the earlier sprints' behaviour
still holds, that the artifacts describe the code as it now is, and that a requirement
contradicting an approved spec is surfaced rather than quietly absorbed.

Whatever the first run of that suite breaks is the real defect list, and it is the evidence Law 11
requires before any new control is added.

## Affected users and systems

- Anyone running the harness on a project longer than one change, which is every project.
- `evals/` gains campaign fixtures and multi-step tasks. The runner already supports steps and no
  task has ever used them.
- Possibly `.aidlc/lib/artifacts.mjs` and the `spec` skill, if the campaigns show the artifact
  model cannot express supersession. Deliberately not decided here.

## Constraints

- The campaigns need a model, so they need the API key. This is the first thing in the repository
  that cannot be answered by a deterministic check.
- Cost is real: a four-sprint campaign is four model runs plus checks. `[models] evals` is Haiku
  4.5 for exactly this reason, and each campaign carries its own ceiling.
- No new control lands in this change. The point is to produce the defect list, not to guess at
  it. Fixes are separate changes with their own gates, per Law 11.

## Open questions

- Does the artifact model need an explicit `supersedes:` link, or is an amended spec on the
  original slug enough? The campaigns answer this; deciding now would be guessing.
- Does brownfield adoption need a verb (`harness adopt`) or is it the `change-safely` skill plus
  a first plan that owns what it touches? Same answer: run it and see.
