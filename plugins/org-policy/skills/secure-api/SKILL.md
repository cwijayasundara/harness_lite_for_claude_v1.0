---
name: secure-api
description: Apply the organization's API security standard. Use whenever creating or modifying an external-facing endpoint, reviewing API code, generating an OpenAPI spec, or writing a spec that adds or changes an API. This skill should be used for auth, input validation, audit events, and PII-in-logs questions.
---

# Secure API

This is the policy owner's source of truth for external endpoints. Replace this example
with the signed standard before treating it as binding.

When you create or change an API endpoint:

1. Authentication: every endpoint requires the gateway JWT; no anonymous routes outside `/health`.
2. Input validation: validate request bodies against the OpenAPI schema and reject unknown fields.
3. Audit: every state-changing endpoint emits an audit event with actor, action, entity, timestamp.
4. Data classification: fields tagged `pii` in the schema must never appear in logs or error messages.

Flag contradictions in `spec.md` under **Policy concerns flagged**. Do not silently weaken a rule.
A policy that must always hold also needs a hook or a review pass — this skill is advisory.
