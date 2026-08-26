# Spec: playbook-operating-loop

- **Date:** 2026-08-24
- **Intent:** [.claude/artifacts/intent/playbook-operating-loop.md](../intent/playbook-operating-loop.md)
- **Status:** approved

## Behaviour

1. `harness handoff` inspects committed artifact status. When an intent is committed-approved
   and the matching spec file is absent, it reports a `spec` action for that slug. It does not
   treat an uncommitted “approved” line as a gate.
2. With `--write`, the same case creates `.claude/artifacts/spec/<slug>.md` from the spec
   template, Status `draft`, linked to the intent. A second run does not overwrite it.
3. When a spec is committed-approved and the matching plan is absent, `--write` creates
   `.claude/artifacts/plan/<slug>.md` as draft. Handoff never creates a review artifact
   (review is produced by the PR review workflow).
4. A GitHub workflow on pushes of approved artifacts to the default branch runs `handoff
   --write` and, if files were created, opens a pull request on a branch. It does not push
   the draft to `main`.
5. A marketplace at the repository root lists two plugins: `lean-harness` (the kernel) and
   `org-policy` (policy skills). `org-policy` skills live outside `.claude/skills`. Measuring
   the kernel budget still reports 12 skills.
6. `harness monitor detect` with no collector and no `--file` exits 0 and reports that
   monitoring is not configured. It does not write artifacts.
7. `harness monitor detect --file <bands.json>` on a numeric breach writes the same-slug
   incident and draft intent. A second detect for the same slug does not fail; it reports
   that the loop is already open. A collect argv in `[monitoring]` is used when `--file` is
   omitted and the command prints a bands document on stdout.
8. A scheduled GitHub workflow runs `monitor detect` with no model invocation. If artifacts
   were written, it opens a pull request.
9. `harness status --json` includes a `playbook` object with: intent survival
   (approved / (approved + closed)), mean hours from intent opened-at to first commit,
   mean spec commits after the first plan commit, first-pass review share, and latest eval
   pass rate when eval results exist. Missing clocks or suites are `null` / `unmeasured`,
   never invented zeros. Intent status `closed` is valid.
10. The human-readable `harness status` prints a playbook section so a weekly operator does
    not have to parse JSON.

## Out of scope

- Invoking Claude non-interactively to write the spec or plan body (handoff writes the
  template; a human or a later session fills it).
- `@claude` comment-fix loops, managed settings / MDM, MCP deploy, Claude Tag, Cowork.
- Adding a kernel skill, agent, or hook.
- Dual-write to Jira/ServiceNow.
- Auto-implement after plan approval.
- Sigma-tier `bands.yaml` with a model in the detector.

## Domain vocabulary

- **Handoff:** creating the next-stage *draft* from a committed approval.
- **Org-policy plugin:** a second Claude Code plugin whose skills are institutional policy,
  not kernel method.
- **Playbook indicators:** the leading/lagging measures named in the Anthropic post, derived
  from git and eval results.
- **Already open:** a detect that finds a breach whose incident/intent already exists.

## Constraints and invariants

- Approval is the first git commit in which Status is `approved`. Editing the working tree
  is not a gate.
- Handoff and detect fail open when the repo has no harness.toml collector; they must not
  wedge CI.
- Policy skills must not be copied into a target repo’s `.claude/skills` by `harness init`.
- Detector uses numeric min/max only.

## Policy concerns flagged

- GitHub token with `contents: write` and `pull-requests: write` on handoff/monitor
  workflows — platform owner. Fork PRs must not run these write jobs (same rule as review).
- Org-policy `secure-api` is an example control, not this organization’s signed policy —
  policy owner must replace the text before treating it as binding.
