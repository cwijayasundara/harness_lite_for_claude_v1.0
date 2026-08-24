---
name: tracker-link
description: Keep a ticket identifier linked to intent.md when a tracker is the system of record. Use when the user names a Jira, Linear, Azure DevOps, or ServiceNow id, or when writing intent from an issue. Do not treat markdown as a second source of truth without a link.
---

# Tracker link

Default: the repo is the source of truth. A tracker holds a copy or a link.

1. Put the record id on the intent `Source:` line.
2. If an MCP tracker server is configured, write the commit SHA of the intent back to that record in the same session.
3. If no MCP server is configured, stop after the `Source:` line. Do not invent a ticket.
