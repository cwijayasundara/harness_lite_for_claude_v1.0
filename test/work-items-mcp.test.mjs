import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, tools } from '../.aidlc/mcp/work-items.mjs';

test('MCP exposes exactly the WorkItemPort operation surface with structured schemas', async () => {
  const listed = await dispatch({ method: 'tools/list' });
  assert.deepEqual(listed.tools.map((tool) => tool.name), [
    'work_item_resolve', 'work_item_snapshot', 'work_item_verify', 'work_item_create', 'work_item_transition',
    'work_item_link_commit', 'work_item_link_contract', 'work_item_link_pr', 'work_item_comment',
  ]);
  assert.ok(tools.every((tool) => tool.inputSchema.additionalProperties === false));
  const initialized = await dispatch({ method: 'initialize' });
  assert.equal(initialized.serverInfo.name, 'aidlc-work-items');
});

test('MCP delegates to the port and preserves a denied human-gate result', async () => {
  const calls = [];
  const port = { transition: async (...args) => { calls.push(args); return { value: { status: 'denied' }, file: 'receipt.json' }; } };
  const result = await dispatch({ method: 'tools/call', params: { name: 'work_item_transition', arguments: { slug: 'x', state: 'accepted', actor: 'agent', actor_kind: 'agent', operation_key: 'k' } } }, { port });
  assert.equal(result.isError, true);
  assert.deepEqual(calls[0], ['x', 'accepted', { actor: 'agent', actorKind: 'agent', operationKey: 'k' }]);
});
