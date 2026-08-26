# Delivery contracts — default delivery path

`aidlc.contract/v1` combines specification, structured execution context, plan, safeguards, and
proof without making a rendered provider prompt another source of truth. It is the company-v1
default; authenticated comparative eval remains a post-adoption validation item.

## Artifact authority

- `.aidlc/artifacts/intent-refs/<slug>.json` identifies one Git or external authority, an immutable
  source revision, the human decision, and the exact source snapshot digest.
- `.aidlc/artifacts/contracts/<slug>.md` owns stable behaviours, scope, approach, operations, and
  proof. Its Change id and intent id must match its filename.
- `.aidlc/artifacts/evidence/<slug>.json` is created once for the exact approved plan digest and is
  never silently overwritten.

Provider adapters may obtain revisions and snapshot digests, but they do not change these rules.

## Delivery flow

```bash
.aidlc/bin/harness contract new checkout-timeout \
  --provider jira --locator PAY-142 --authority external

.aidlc/bin/harness contract accept checkout-timeout \
  --by owner@example.com \
  --revision 17 \
  --snapshot-digest sha256:<64-hex-digest>

git add .aidlc/artifacts && git commit -m "Accept checkout-timeout intent"

.aidlc/bin/harness contract seal checkout-timeout --scope spec
git add .aidlc/artifacts && git commit -m "Approve checkout-timeout spec"

.aidlc/bin/harness contract seal checkout-timeout --scope plan
git add .aidlc/artifacts && git commit -m "Approve checkout-timeout plan"

.aidlc/bin/harness contract prompt checkout-timeout --provider codex --role execute
.aidlc/bin/harness contract evidence checkout-timeout
.aidlc/bin/harness contract status checkout-timeout
.aidlc/bin/harness contract validate --all
```

Each transition fails closed when its preceding decision is uncommitted, its digest is stale, its
source is unreproducible, the Markdown structure is malformed, or an artifact would be overwritten.
`validate --all` is the CI boundary for repositories.

Evidence is initialized with one entry for every stable `B<n>` behaviour. A contract reaches
`complete` only when every behaviour is `pass` with evidence and human review is `approved`.
Prompt manifests are deterministic, digest-bound projections; they are receipts, not editable
requirements.

## Rehearsing migration

Migration never carries legacy approvals across formats and never deletes the source chain:

```bash
.aidlc/bin/harness contract migrate checkout-timeout             # dry-run
.aidlc/bin/harness contract migrate checkout-timeout --write     # draft contract + receipt
.aidlc/bin/harness contract rollback-migration checkout-timeout  # only if outputs are untouched
```

Rollback verifies the recorded digests before removing generated files. If a migrated artifact
has changed, it refuses to destroy it. The intent must be accepted and the combined spec and plan
must be reviewed and approved again in contract form.

## Compatibility boundary

Legacy intent/spec/plan files are read only by status, scope migration, and the explicit
`contract migrate` command. There are no generators, skills, handoff workflows, or approval
automation for that chain. New delivery work always uses contracts.
