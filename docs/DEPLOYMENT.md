# Immutable deployment lifecycle

Phase 6 turns the earlier three-command seam into a six-operation delivery port:
`preflight -> deploy -> status -> verify -> promote`, with `rollback` restoring recorded release
history. Commands are fixed argv from `.aidlc/harness.toml`, or the packaged Docker Compose
provider selected with `platform = "docker-compose"`. A model may interpret a failed receipt but
cannot submit or alter an executable command.

Every attempted configured operation writes `aidlc.deployment-receipt/v1` under
`.aidlc/artifacts/deployment/`, including denials, failures, timeouts, stdout, stderr, approvals,
risk, environment, and immutable artifact digest.

## Lifecycle

```sh
harness deploy preflight staging --artifact sha256:<digest>
harness deploy deploy staging --artifact sha256:<digest>
harness deploy status staging
harness deploy verify staging --artifact sha256:<digest>

harness deploy preflight production --artifact sha256:<same-digest>
harness deploy promote production --from staging --artifact sha256:<same-digest> \
  --risk standard --approval CAB-123

harness deploy rollback staging
```

Deploy and promote require the latest preflight for the same environment and digest. Verify only
accepts the artifact currently recorded as deployed. Any later failed verification clears the
earlier green state. Promote requires the same digest to remain deployed and most recently
verified in the source environment. Rollback selects the previously recorded digest and clears
verification until it is checked again.

Production deploy, promotion, and rollback are denied without authorization. Low and standard
risk require one approval by default; critical risk requires two distinct IDs. Allowed production
risks and approval count are configuration policy, not model judgement.

## Docker Compose staging provider

```toml
[deployment]
platform = "docker-compose"
compose_file = "compose.yaml"
service = "api"
image_repository = "registry.company.example/payments/api"
project_slug = "payments"
verify_url_staging = "https://payments.staging.example/health"
production_requires_approval = true
production_allowed_risks = ["low", "standard", "critical"]
critical_approvals = 2
require_preflight = true
```

The Compose file uses `image: ${AIDLC_IMAGE}`. The adapter constructs
`<image_repository>@sha256:<digest>`, validates the Docker daemon and Compose model, deploys with
`--no-build --wait`, inspects container state and health, and optionally calls a deterministic
verification URL. It exposes only the six operations; there is no arbitrary Docker-command tool.

The executable rehearsal in `examples/docker-staging/rehearse.sh` deploys an immutable public
Nginx digest, verifies it, proves production denial, deploys a second digest, and rolls staging
back to the first. `.github/workflows/harness-rehearse.yml` runs it on a real Docker daemon and
uploads the receipts.
