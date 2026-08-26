# Work-item port and Jira pilot

Phase 5 connects the delivery contract to one external intent authority without making Jira the
kernel. `WorkItemPort` owns semantic operations and policy; `JiraAdapter` owns URLs, Atlassian
Document Format, authentication, pagination, and Jira transition discovery. Azure Boards and
Linear should implement this same port only after passing the existing conformance tests.

The supported surface is `resolve`, `snapshot`, `create`, `transition`, `link_commit`,
`link_contract`, `link_pr`, and idempotent `comment`. `verify` is the drift gate over `snapshot`.
Every write emits an `aidlc.work-item-receipt/v1` file under
`.aidlc/artifacts/work-item-receipts/`.

## Configure a Jira pilot

```toml
[work_items]
provider = "jira"
authority = "external"
base_url = "https://company.atlassian.net"
project_key = "POD"
issue_type = "Story"
accepted_status = "Accepted"
closed_status = "Done"
approvers = ["owner@company.example"]
timeout_ms = 30000
```

Set `JIRA_EMAIL`, `JIRA_API_TOKEN`, and the authenticated company identity in `HARNESS_ACTOR`.
Secrets are never stored in harness configuration. Human transitions require all three facts to
agree: `--actor-kind human`, `--actor` equals `HARNESS_ACTOR`, and that identity appears in
`approvers`. Agent actors are unconditionally denied acceptance and closure. Jira still performs
its own permission check, and any authentication or authorization error fails closed.

```sh
node .aidlc/bin/harness work-items doctor
node .aidlc/bin/harness work-items create checkout-flow \
  --title "Reliable checkout" --description-file intent.md --key create-checkout-v1
node .aidlc/bin/harness work-items transition checkout-flow accepted \
  --actor "$HARNESS_ACTOR" --actor-kind human --key accept-checkout-v1
node .aidlc/bin/harness work-items verify checkout-flow
```

Operation keys are mandatory. Create uses a deterministic Jira label and resolves it before
writing; transitions compare the current state; links use a deterministic remote-link `globalId`;
comments use a deterministic marker and scan every comment page. These mechanisms follow Jira
Cloud REST v3’s [issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/),
[transition](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-transitions/),
[remote-link](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-remote-links/),
and [comment](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/)
resources.

## Authority and drift

An intent ref declares exactly one authority. Git intents remain unchanged. An external Jira
intent stores its locator, approved revision, and digest of normalized intent-bearing fields:
title, description, project, and issue type. Comments, links, and workflow status do not
invalidate the intent. A changed intent digest makes `verify` fail and automatically blocks prompt
rendering, model handoff/invocation, and review-packet creation. The signed approval is retained as
audit evidence rather than silently rewritten.

## MCP

`.aidlc/mcp/work-items.mjs` exposes the same port as nine structured MCP tools. It contains no
separate lifecycle decisions. Configure any MCP-capable coding agent to execute:

```json
{
  "mcpServers": {
    "aidlc-work-items": {
      "command": "node",
      "args": [".aidlc/mcp/work-items.mjs"]
    }
  }
}
```

Keep this projection in the provider’s disposable configuration (`.mcp.json`, Cursor MCP config,
Codex MCP configuration, or the equivalent). The canonical implementation remains under
`.aidlc/`.
