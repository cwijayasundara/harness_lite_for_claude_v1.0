---
status: approved
by: cwijayasundara
at: 2026-09-05T04:14:16.842Z
digest: sha256:705588f5714938d902df87495a87c1da7d0e4ac52103e0022e7f9fe2fd8628e0
---
# Spec: a-plan-proves-its-spec

## Outcome

A gate refuses an artifact that says nothing, and refuses a plan that proves nothing.

## Why one change and not two

F14 and F17 are the same absence at two points in the chain. Every precondition `approve()` enforces
is about an artifact's *state* — is it committed, does a plan follow an approved spec, does the
digest match. None is about its *content*. So a spec that is still the scaffold, and a plan whose
Proof table is empty of the behaviours it must prove, both pass. Fixing one and not the other leaves
the gate exactly as trustworthy as it is now.

## Observable behaviours

### B1 — a template is not an artifact

Given a `spec.md` or `plan.md` still carrying the scaffold `harness new` writes,
When it is approved,
Then the approval is refused, naming the placeholder it found.

`harness new` writes those markers from `.aidlc/templates/`, so the harness recognises its own
output rather than guessing at prose. Angle-bracket placeholders (`<The observable result, ...>`)
and a behaviour whose body is a bare `Given ... When ... Then ...` are the tells.

### B2 — every behaviour has a proof row

Given a `plan.md` being approved,
When its spec claims `### B<n>` behaviours,
Then each one must appear in the plan's Proof table, and the approval is refused naming those that
do not.

Presence of a row, and nothing more. `evidence.md` F11 and F15 record that across two campaigns,
two fixtures and five slugs, every plan an agent wrote unprompted proves behaviours with prose
rather than a resolvable test. Demanding a resolvable test would refuse almost every plan ever
written here, and a gate that always refuses is one people work around — F2 records an agent doing
exactly that to `require_contract`.

### B3 — the refusal names the way forward

Given any refusal from B1 or B2,
When it is printed,
Then it names the file, what is missing, and the single command or edit that fixes it. `evidence.md`
F2 and F12 are the two halves of this: a refusal with no way forward sent an agent hunting for the
switch that disables the guard, and a refusal that named one produced three artifacts and a clean
brownfield adoption.

### B4 — a human can still say the rule is wrong here

Given a plan that deliberately omits a proof row, or a spec that deliberately reads like a template,
When the person approving knows why and says so,
Then there is a way to proceed that leaves a record of the exception.

The mechanism is the spec's to choose and the plan's to design. What is not acceptable is a check
with no override: the harness's own `[limits]` are overridable in `harness.toml` with a `why:`, and
a gate that cannot be argued with is a gate that gets deleted.

### B5 — the existing corpus is data, not a verdict

Given this repository's own changes,
When the check runs across them,
Then whatever it refuses is reported and recorded, and no artifact is edited to make it pass.

Measured before writing this spec: zero of the plans reachable today omit a proof row. That result
means less than it appears — `evidence.md` F16 records that only three of twenty-four specs read
`approved`, so the check could only see three. The number to watch is what happens after F16 is
addressed, not now.

### B6 — nothing already approved is retroactively refused

Given an artifact approved before this change,
When it is read,
Then it stays approved. This check applies at the moment of approval, and re-approving is a human's
decision, not a migration's.

### B7 — a promise made at approval is checked when it comes due

Given a change whose plan is approved,
When `harness check --stage commit` runs,
Then every Proof row that names a test file must name one that exists, and the check fails naming
those that do not.

**Added 2026-09-05, after `evidence.md` F25.** B2 asserts presence of a row and nothing more,
deliberately, because a plan legitimately names a test it has not written yet. The campaign
confirmed that reasoning and then showed its cost: `campaign-legacy`'s agent wrote a plan naming
`tests/test_reports.py` for three behaviours, had it approved, and never created the file. Before
this change the same campaign failed because the agent promised nothing; now it promises something
and nothing checks the promise was kept.

The asymmetry is the point. Approval is the wrong moment to ask — the answer is unknowable then.
`--stage commit` on an approved change is the right one, because by then the answer exists. This
behaviour is where B2's deferred question gets asked.

Identifier resolution stays out of it: the file must exist, not the named test within it. That is
the same bar `behavioursHaveTests` already applies, and F11 and F15 say no agent writes a row
naming a resolvable identifier.

## Out of scope

- **Requiring a proof row to name a resolvable test.** F11 and F15 say no agent writes that shape
  and no plan here uses it. B2 asserts presence; anything stronger is a separate change with its own
  evidence.
- **F16 itself** — that only three of twenty-four specs read `approved`. It bounds what this check
  can see and it is its own change.
- **Checking that a spec's behaviours are *good*.** Not mechanical, needs a model, and the evaluator
  already does it on a diff.
- **Retrofitting the twenty-three migrated changes.** B6 says they stay as they are.

## Safeguards

- No new skill, no new hook binding. Skills are 7/7 and bindings 4/5.
- The template markers must come from `.aidlc/templates/`, not be hand-copied into a checker. Two
  copies of the same string drift — review `1ace6a8` Nit 2 caught exactly that this week.
- The existing approval tests are the regression suite, and **no assertion in them may change**. If
  one has to be weakened, the gate has moved rather than tightened and the change is wrong.

  **Amended 2026-09-05, during implementation.** This safeguard originally said those tests must
  "pass unchanged", and named only `test/lifecycle-cli.test.mjs`. Implementing B1 showed both halves
  to be wrong. Eight tests break — two there and six in `test/autogate.test.mjs`, which the spec
  never mentioned — because every one of them builds its fixture with `harness new` and approves the
  result *untouched*. They test state logic: uncommitted, plan-before-spec, `stale-approval`, and the
  whole unattended mechanism. B1 refuses a bare scaffold, which is exactly what those fixtures are.

  So the fixtures must gain content while every assertion stays identical. That is the line that
  matters and it is the line this safeguard now draws. Note what the breakage says about F17: the
  harness's own suite approves unedited scaffolds in eight places, which is why nobody noticed that
  `approve` accepts them until a human approved one by hand.
