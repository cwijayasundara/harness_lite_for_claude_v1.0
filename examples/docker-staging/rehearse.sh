#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
harness="$here/../../.aidlc/bin/harness"
cd "$here"

cleanup() {
  AIDLC_IMAGE="nginx@${first_digest:-sha256:$(printf '0%.0s' {1..64})}" docker compose -f compose.yaml -p aidlc-rehearsal-staging down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker pull nginx:alpine >/dev/null
first_ref="$(docker image inspect nginx:alpine --format '{{index .RepoDigests 0}}')"
first_digest="${first_ref##*@}"

node "$harness" deploy preflight staging --artifact "$first_digest"
node "$harness" deploy deploy staging --artifact "$first_digest"
node "$harness" deploy status staging
node "$harness" deploy verify staging --artifact "$first_digest"
node "$harness" deploy preflight production --artifact "$first_digest"

# This is the production-denial rehearsal. Success would be a release-control failure.
if node "$harness" deploy promote production --from staging --artifact "$first_digest"; then
  echo "production promotion unexpectedly succeeded without approval" >&2
  exit 1
fi

docker pull nginx:stable-alpine >/dev/null
second_ref="$(docker image inspect nginx:stable-alpine --format '{{index .RepoDigests 0}}')"
second_digest="${second_ref##*@}"
node "$harness" deploy preflight staging --artifact "$second_digest"
node "$harness" deploy deploy staging --artifact "$second_digest"
node "$harness" deploy verify staging --artifact "$second_digest"
node "$harness" deploy rollback staging
node "$harness" deploy verify staging --artifact "$first_digest"
