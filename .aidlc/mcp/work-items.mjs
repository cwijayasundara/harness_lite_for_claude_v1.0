#!/usr/bin/env node
// MCP is a transport projection only. Every call delegates to WorkItemPort, so coding agents and
// the CLI receive identical authority checks, idempotency rules, receipts, and drift decisions.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { loadConfig } from '../lib/config.mjs';
import { findRepoRoot } from '../lib/paths.mjs';
import { WorkItemPort } from '../lib/work-items.mjs';

const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string', minLength: 1 };
export const tools = [
  { name: 'work_item_resolve', description: 'Resolve a Jira work item without changing it.', inputSchema: schema({ locator: string }, ['locator']) },
  { name: 'work_item_snapshot', description: 'Capture the normalized external intent snapshot for a change.', inputSchema: schema({ slug: string }, ['slug']) },
  { name: 'work_item_verify', description: 'Fail when the external intent has drifted from its approved digest.', inputSchema: schema({ slug: string }, ['slug']) },
  { name: 'work_item_create', description: 'Create or resolve one idempotent Jira work item and Git intent reference.', inputSchema: schema({ slug: string, title: string, description: string, operation_key: string }, ['slug', 'title', 'description', 'operation_key']) },
  { name: 'work_item_transition', description: 'Human-attributed semantic transition. Agents cannot accept or close.', inputSchema: schema({ slug: string, state: { enum: ['accepted', 'closed'] }, actor: string, actor_kind: { enum: ['human', 'agent'] }, operation_key: string }, ['slug', 'state', 'actor', 'actor_kind', 'operation_key']) },
  ...['commit', 'contract', 'pr'].map((kind) => ({ name: `work_item_link_${kind}`, description: `Idempotently link a ${kind} to the work item.`, inputSchema: schema({ slug: string, url: { type: 'string', pattern: '^https://' }, title: string, operation_key: string }, ['slug', 'url', 'operation_key']) })),
  { name: 'work_item_comment', description: 'Add an idempotent work-item comment and durable receipt.', inputSchema: schema({ slug: string, body: string, operation_key: string }, ['slug', 'body', 'operation_key']) },
];

export async function callTool(name, args, { port = new WorkItemPort(loadConfig(findRepoRoot())) } = {}) {
  if (name === 'work_item_resolve') return port.resolve(args.locator);
  if (name === 'work_item_snapshot') return port.snapshot(args.slug);
  if (name === 'work_item_verify') return port.verify(args.slug);
  if (name === 'work_item_create') return port.create(args.slug, { title: args.title, description: args.description }, { operationKey: args.operation_key });
  if (name === 'work_item_transition') return port.transition(args.slug, args.state, { actor: args.actor, actorKind: args.actor_kind, operationKey: args.operation_key });
  if (name.startsWith('work_item_link_')) return port.link(args.slug, name.slice('work_item_link_'.length), args.url, { title: args.title, operationKey: args.operation_key });
  if (name === 'work_item_comment') return port.comment(args.slug, args.body, { operationKey: args.operation_key });
  throw new Error(`unknown tool ${name}`);
}

function response(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`); }
function error(id, value) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: value.message } })}\n`); }

export async function dispatch(message, options = {}) {
  if (message.method === 'initialize') return { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'aidlc-work-items', version: '1.0.0' } };
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'tools/call') {
    const value = await callTool(message.params?.name, message.params?.arguments ?? {}, options);
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], isError: value?.value?.status === 'denied' || value?.ok === false };
  }
  if (message.method === 'notifications/initialized') return null;
  throw new Error(`unsupported MCP method ${message.method}`);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(new URL(import.meta.url).pathname)) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    let message; try { message = JSON.parse(line); } catch (cause) { error(null, new Error(`invalid JSON: ${cause.message}`)); return; }
    try { const result = await dispatch(message); if (message.id !== undefined) response(message.id, result); }
    catch (cause) { if (message.id !== undefined) error(message.id, cause); }
  });
}
