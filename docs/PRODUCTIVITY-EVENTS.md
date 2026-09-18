# Productivity evidence interchange

The harness measures delivery without becoming a tracker or observability platform. Git remains
the clock for intent, spec and plan creation. Existing PR, CI/CD, deployment, incident and
time-tracking systems export bounded events into one append-only local interchange file.

## Event schema

Every JSON or JSONL record uses `harness.productivity-event/v1` and includes:

```json
{
  "schema": "harness.productivity-event/v1",
  "id": "github-run-12345-attempt-1",
  "change": "checkout-timeout",
  "stage": "ci",
  "event": "completed",
  "at": "2026-09-18T10:00:00Z",
  "actor_type": "ci",
  "result": "pass",
  "candidate": "0123456789abcdef",
  "duration_ms": 84000,
  "first_pass": true,
  "rerun": false,
  "repair_cause": null,
  "model": null,
  "model_version": null,
  "cost_usd": 0.04,
  "environment": "github-hosted",
  "source": "GitHub Actions"
}
```

Stages are `intent`, `spec`, `plan`, `candidate`, `pr`, `ci`, `review`, `deploy`, and `incident`.
Results are `pass`, `fail`, `cancelled`, `abandoned`, `timed-out`, `rolled-back`, and `unmeasured`.
Actor types are `human`, `agent`, `ci`, and `system`.
Events are `started`, `created`, `accepted`, `opened`, `completed`, `finding`, `resolved`, `merged`,
`closed`, `deployed`, `healthy`, `rollback`, `breach`, `diagnosed`, and `triaged`.

Fields used by particular sources:

| Source | Required join and measurement fields |
|---|---|
| PR/review | `change`, `candidate`, timestamps; `findings` requires `resolver_type` |
| CI | `change`, `candidate`, `duration_ms`, `first_pass`, `rerun`, `repair_cause` |
| Deployment | `change`, `candidate`, `release`, `artifact`, `environment`, `health`, `rollback`, `failure` |
| Incident | `change`, `environment`, `linked_intent`, `recurrence_class`; use breach/diagnosed/triaged events |
| Human effort | `actor_type: human` and `active_minutes`; never substitute elapsed duration |
| Model work | `model`, `model_version`, and `cost_usd` from the originating invocation |

Deployment and incident events deliberately require their identity joins. Missing evidence is not
converted to zero or success. Failed, abandoned, timed-out and rolled-back attempts remain rows.

## Ingest and export

Export events from the owning system, then ingest them from the repository root:

```sh
harness metrics ingest --file evidence/events.jsonl
harness metrics --days 30
harness metrics --days 30 --json
harness metrics export --format json > productivity-events.json
harness metrics export --format csv > productivity-events.csv
```

The importer validates the entire batch before appending, rejects duplicate event IDs, and accepts
at most 10 MiB per import. It does not fetch credentials, poll services, mutate upstream records,
or silently update an existing event. Correct a bad source record with a new uniquely identified
event and preserve the original audit row.

JSON export uses `harness.productivity-export/v1`. CSV columns follow the documented event fields
in stable order and quote spreadsheet-sensitive separators. The core intentionally provides no
dashboard; teams may analyze either export with their existing tooling.

## Interpretation

The report provides sample counts, median/p75/p90 elapsed duration and human active minutes,
first-pass CI, change-failure rate, total observed cost, cost per healthy deployment, and
quality-adjusted throughput. Existing Git-derived intent-to-spec and spec-to-plan metrics remain
the authoritative early-stage clock.
Rates and distributions remain `unmeasured` below five observations.

These observations enable the controlled Phase 4 comparison. They are not themselves proof of a
productivity gain: comparisons require matched baseline and harness cohorts, sufficient samples,
production-quality guardrails, and preserved unsuccessful attempts.
