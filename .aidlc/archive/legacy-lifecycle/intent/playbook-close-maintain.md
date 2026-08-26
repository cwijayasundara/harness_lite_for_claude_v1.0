# Intent: playbook-close-maintain

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T14:40:00.000Z
- **Author:** Chaminda Wijayasundara
- **Status:** approved
- **Source:** conversation — remaining harness-owned items after the playbook 10/10 program landed on main

## Problem

The playbook's Maintain loop is still incomplete in two ways that this git repo can fix. A 3σ band breach opens an incident and a draft intent, but it never rehearses the staging rollback the article says must exist before an agent is trusted with the loop. This checkout's `[monitoring].collect` is empty, so the hourly detector is a no-op even in GitHub Actions. The P0 kernel-tighten intent is still draft even though those guards already shipped, so the artifact chain lies about what is approved.

Live model evals, MDM-pushed managed settings, Cowork connectors, and a signed org policy are not missing harness files. They need credentials and platform owners this repository cannot invent.

## Proposed outcome

The first 3σ detect, when a rollback argv is configured, runs staging rollback only and writes a receipt; a repeat detect for the same slug does not roll back again. An unconfigured rollback still writes incident and intent. This repo's collector is wired and fails open to an empty band set when GitHub is unavailable. The P0 intent/spec/plan match the guards that already shipped.

## Affected users and systems

Platform engineers, `harness monitor detect`, `harness-monitor.yml`, `[deployment].rollback`, `[monitoring].collect`, artifact status.

## Constraints

- Skills stay at 12, agents at 3, hook bindings at 5.
- Detection stays model-free. Rollback is the configured argv, never a model, never production.
- `require_plan` stays default-off in templates so evals and this kernel repo do not wedge. Product repos turn it on.
- Zero runtime dependencies.

## Open questions

- Live evals need Claude credentials. None are present on this machine; CI `--require-auth` remains the path.
- Production deploy argv stays empty here: this repository is the harness, not a service with a rollback target.
