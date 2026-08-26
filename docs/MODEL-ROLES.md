# Model roles and committed handoffs

`.aidlc/model-policy.json` is the single model-routing authority. Delivery artifacts refer to
neutral roles, never to a model alias:

| Role | Default policy | Access |
|---|---|---|
| `specify` | generation / Claude Sonnet 5 | contract writes in a fresh context |
| `generate` | generation / Claude Sonnet 5 | product writes in the working context |
| `evaluate` | high-assurance / Claude Opus 5 | read-only, fresh context |
| `diagnose` | high-assurance / Claude Opus 5 | read-only, fresh context |

The defaults follow the requested Sidekick-style split. Anthropic's current migration guide names
the API models `claude-sonnet-5` and `claude-opus-5`; the policy records those full names and a
policy digest rather than the floating Claude Code aliases `sonnet` and `opus`.

```bash
.aidlc/bin/harness models doctor
.aidlc/bin/harness models resolve evaluate --json
.aidlc/bin/harness models handoff checkout-timeout \
  --from generate --to evaluate --invocation generator-run-42
.aidlc/bin/harness models invoke evaluate checkout-timeout --attempt 1
.aidlc/bin/harness models ingest checkout-timeout \
  --file evaluation.json --attempt 1
```

A handoff binds the approved contract digest, committed Git revision, source invocation, target
role, resolved provider/model, policy digest, and attempt ceiling. Evaluation must come from a
different invocation, map every finding to a contract behaviour, and use safe repository-relative
paths. Malformed reports are not partially accepted.

Fallback is opt-in. With no configured fallback, an outage stops the role instead of silently
downgrading it. Run receipts must identify timeout and budget breaches honestly. A changes-requested
evaluation returns to `generate` until `max_repair_loops` is exhausted; it never loops forever.

The kernel does not call Anthropic, Codex, Cursor, Copilot, or Grok directly. The initial
`.aidlc/providers/claude-code.mjs` adapter consumes the resolution and invokes Claude Code with the
full model ID, effort, timeout, cost ceiling, and role-specific tool policy. Evaluation denies
Write, Edit, NotebookEdit, and Bash and uses CLI JSON Schema output. Every invocation writes an
`aidlc.model-run/v1` receipt with its actual session ID, cost, duration, status, and output digest.
Other provider adapters must return the same receipt contract. This preserves portability and
keeps credentials out of lifecycle logic.

Model identifiers verified against the [official Anthropic migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide).
