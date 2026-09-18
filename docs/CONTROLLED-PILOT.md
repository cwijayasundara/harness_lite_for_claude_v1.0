# Thin-core controlled pilot

This is the pre-registered protocol for Phase 4 of the production implementation plan. It compares
native Claude Code plus existing project CI against the thin default harness. Optional evaluator,
graph, autonomous-delivery, coordination and live-eval modules are excluded; Phase 5 tests those
independently.

## Hypotheses and decision rule

Primary outcomes are quality-adjusted throughput, human active minutes per accepted change, lead
time to a healthy production deployment, and change-failure rate. Total cost per accepted change
is a guardrail. The harness advances only when a 95% interval shows lower human effort or higher
quality-adjusted throughput, while the change-failure increase is no more than five percentage
points and cost does not increase. Otherwise revise or remove the losing stage.

The directional minimum is 20 terminal changes per arm. Failed, cancelled, abandoned, timed-out,
rolled-back, budget-exhausted and incomplete assignments remain in the raw counts. Encode a
budget exhaustion as `failure` or `repair_cause: "budget-exhausted"` on its terminal event.
Emergency
production changes are observed separately and are not randomized. Eligible work must be a real,
bounded product change that can use the same model/version, project tools and CI profile in either
arm. Pre-existing work, harness-development work, unverifiable changes, and tasks whose treatment
is operationally forced are excluded.

Randomization is stratified by repository, task type, risk and engineer experience. Commit the
registration before collecting outcomes. Its `units` need stable change IDs and the frozen
model/version and CI profile. Do not add or remove units because of their results.

```json
{
  "schema": "harness.controlled-pilot/v1",
  "id": "team-pilot-2026-q4",
  "registered_at": "2026-10-01T09:00:00Z",
  "seed": "commit-a-public-random-seed-before-outcomes",
  "hypotheses": ["The thin harness reduces human minutes or improves quality-adjusted throughput."],
  "inclusion_rules": ["Real non-emergency product change eligible for either arm."],
  "primary_outcomes": ["Quality-adjusted throughput", "Human active minutes", "Lead time", "Change failure"],
  "decision_rule": ["Use the advance rule documented in docs/CONTROLLED-PILOT.md."],
  "limitations": ["A 40-change directional sample cannot establish universal reliability."],
  "units": [{
    "change": "stable-change-id", "repository": "owner/repo", "task_type": "defect",
    "risk": "medium", "experience": "maintainer", "model": "claude-sonnet",
    "model_version": "frozen-version", "ci_profile": "github-prod"
  }]
}
```

Generate and commit concealed-outcome assignments:

```sh
node evals/pilot.mjs assign --registration pilot-registration.json > pilot-assigned.json
```

Collect the existing `harness.productivity-event/v1` records. CI event `environment` must equal
the registered `ci_profile`; model events must retain the registered model and version. Human
active minutes come from a timer or stage-completion prompt, never elapsed time. Then publish the
unaltered registration, assignments, event export and analysis together:

```sh
node evals/pilot.mjs analyze --registration pilot-assigned.json --events productivity-events.jsonl \
  > pilot-analysis.json
```

The analysis exits zero only for `decision: advance`. Underpowered, incomplete or mismatched
evidence exits nonzero and reports `insufficient-evidence`; a powered result that does not prove
the registered gain reports `revise-or-remove`. The JSON includes every assignment, raw arm counts,
95% confidence intervals, protocol mismatches and limitations.

`test/pilot.test.mjs` exercises this command path with a 40-change slug-service fixture. Its
generated effort and cost observations prove assignment, ingestion, analysis and reporting work
end to end. They are test data, not observations of engineers or production changes, and therefore
do not satisfy P4.2–P4.7 or support the adoption decision.
