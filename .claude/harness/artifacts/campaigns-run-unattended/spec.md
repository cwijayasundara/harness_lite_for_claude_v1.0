---
status: approved
by: cwijayasundara
at: 2026-09-04T10:23:01.400Z
digest: sha256:85378879a77d92ee48509f5aee54627b0536ad945c2ba97992b0c602244d5e0e
---
# Spec: campaigns-run-unattended

## Outcome

A campaign runs to its last sprint with no human present, and the artifacts it leaves behind never
read as though one was there.

## The intent's open questions, answered

**Both gates, not just spec.** `require_contract` refuses a product write unless a committed
*approved plan* owns the path. Auto-approving only the spec would move the halt from gate 1 to
gate 2 and change nothing.

**The refusal survives, and must.** Auto-approval replaces the human's keystroke and nothing else.
The agent is still refused at its first product write, still has to write intent, spec and plan,
still has to commit them, and still has to ask. `evolving-scope` B8 measures whether the refusal
names a way forward that works; this change supplies the missing end of that way forward rather
than removing the refusal. A design that pre-approves artifacts before the agent writes them would
destroy B8, and is out of scope below.

**Gate 3 does not arise.** Campaigns never open a pull request and never merge. Confirmed against
both campaign tasks: neither asserts anything past `harness check --stage stop`.

## Observable behaviours

### B1 — an unattended run can pass its own gates

Given a campaign step executing against a staged working copy,
When the agent writes and commits `intent.md`, `spec.md` and `plan.md` and then approves them,
Then the approval succeeds with no human, and the agent proceeds to write product code under a
plan that owns the path.

### B2 — the approver is visibly not a person

Given any artifact approved during an eval run,
When its frontmatter is read,
Then `by:` is an identity that cannot be mistaken for a human, and the value is fixed rather than
supplied by the agent. A campaign result must never be readable as evidence that someone looked.
An agent that can choose its own approver name can write a person's.

### B3 — off by default, and the working copy cannot turn it on

Given a repository with no eval run in progress,
When any artifact is approved,
Then the human gate applies exactly as it does today.

And given a working copy that contains a file — `harness.toml`, a settings file, anything — asking
for auto-approval,
When the agent approves,
Then it is refused. The signal comes from the runner that staged the copy, never from inside the
copy. `evidence.md` F2 records an agent that tried to disable `require_contract` by rewriting
`harness.toml`; a switch that same agent could have written is the same defect wearing a different
hat.

### B4 — the real workflow is untouched

Given the 22 single-prompt golden tasks and every existing test of the approval path,
When they run,
Then their behaviour is unchanged. None of them reaches a gate today, and none of them may start.

### B5 — everything else about approve still holds

Given an eval run,
When an artifact is approved,
Then an uncommitted artifact is still refused, a plan before its spec is still refused, the body
digest is still written, and editing an approved artifact still reports `stale-approval`. Only the
identity of the approver and the absence of a human change. A gate that stops checking the things
it checks today is not a gate that ran unattended; it is one that stopped.

### B6 — a campaign reaches its last sprint

Given `campaign-ledger`,
When it runs,
Then sprint 3 executes. This is the behaviour that pays for the change: until it holds,
`evolving-scope` B3, B4, B5, B6 and B7 have no evidence and cannot get any.

### B7 — the run says what it did

Given a completed eval run in which artifacts were auto-approved,
When its output and results JSON are read,
Then the auto-approvals are visible there, not only in the staged copy that is about to be
deleted. A mechanism that silently substitutes for a human should be the loudest thing in the log.

## Out of scope

- **Any change to how a person's repository gates.** If this change makes a real repository even
  slightly less gated, it has failed regardless of what the campaigns then do.
- **`dunning`, and every other real project.** The example application exists to produce defects
  under Law 11 by being built through the harness as a person would. Auto-approving its gates would
  remove the thing it is there to test.
- **Pre-approving artifacts, or seeding the fixture with an approved plan.** Both would make
  campaigns run and would delete `evolving-scope` B8's subject matter in the process.
- **Auto-merge, or anything at gate 3.** Campaigns do not merge.
- **The other findings in `evidence.md`.** F2 (the refusal names no working way forward), F3
  (product code landed with no plan), F4 (the graded transcript is the closing message) and F5 each
  become their own change. F1 is this one.

## Safeguards

- The enabling signal must not be reachable from inside the staged working copy, and a test must
  assert that a copy which tries to enable it is still refused.
- The fixed non-human approver identity must be asserted by a test, not merely documented.
- The existing approval tests are the regression suite for B4 and B5 and must pass unchanged. A
  change to one of them is a change to the gate, and needs saying out loud.
