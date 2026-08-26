import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkItemPort, requireCurrentExternalIntent, validateReceipt } from '../.aidlc/lib/work-items.mjs';

class FakeJira {
  constructor() { this.issue = null; this.creates = 0; this.transitions = 0; this.links = new Map(); this.comments = new Map(); }
  async resolve(locator) { if (!this.issue || this.issue.locator !== locator) throw new Error('not found'); return { ...this.issue }; }
  async create(input, key) {
    if (this.issue?.key === key) return { item: { ...this.issue }, replayed: true };
    this.creates++; this.issue = { provider: 'jira', locator: 'POD-7', revision: '1', title: input.title, description: input.description, status: 'Draft', project: 'POD', issue_type: 'Story', key };
    return { item: { ...this.issue }, replayed: false };
  }
  async transition(locator, target) { this.transitions++; this.issue.status = target; this.issue.revision = String(Number(this.issue.revision) + 1); return { item: { ...this.issue }, replayed: false }; }
  async link(locator, kind, url, title, key) { const replayed = this.links.has(key); this.links.set(key, { kind, url, title }); return { global_id: key, replayed }; }
  async comment(locator, body, key) { const replayed = this.comments.has(key); this.comments.set(key, body); return { id: key, replayed }; }
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aidlc-work-items-')); const artifacts = path.join(root, '.aidlc', 'artifacts');
  const intentRefs = path.join(artifacts, 'intent-refs'); const workItems = path.join(artifacts, 'work-items'); const workItemReceipts = path.join(artifacts, 'work-item-receipts');
  for (const dir of [intentRefs, workItems, workItemReceipts]) mkdirSync(dir, { recursive: true });
  const cfg = { project: { name: 'pilot' }, work_items: { provider: 'jira', accepted_status: 'Accepted', closed_status: 'Done', approvers: ['owner@company.test'] }, layout: { root, intentRefs, workItems, workItemReceipts } };
  const adapter = new FakeJira(); const port = new WorkItemPort(cfg, { adapter, principal: 'owner@company.test', now: () => new Date('2026-08-26T10:00:00.000Z') });
  return { root, cfg, adapter, port };
}

test('WorkItemPort implements the complete operation surface with durable valid receipts', async () => {
  const { port } = fixture();
  const created = await port.create('checkout-flow', { title: 'Checkout flow', description: 'Observable customer outcome' }, { operationKey: 'request-1' });
  const linked = await Promise.all([
    port.link('checkout-flow', 'commit', 'https://git.invalid/commit/abc', { operationKey: 'commit-abc' }),
    port.link('checkout-flow', 'contract', 'https://git.invalid/blob/contract', { operationKey: 'contract-v1' }),
    port.link('checkout-flow', 'pr', 'https://git.invalid/pr/7', { operationKey: 'pr-7' }),
  ]);
  const commented = await port.comment('checkout-flow', 'Evidence is ready', { operationKey: 'evidence-ready' });
  for (const result of [created, ...linked, commented]) assert.deepEqual(validateReceipt(JSON.parse(readFileSync(result.file, 'utf8'))), []);
  assert.equal((await port.resolve('POD-7')).title, 'Checkout flow');
  assert.equal((await port.snapshot('checkout-flow')).schema, 'aidlc.work-item-snapshot/v1');
});

test('write retries are idempotent across create, transition, link, and comment', async () => {
  const { port, adapter } = fixture();
  await port.create('retry-safe', { title: 'Retry safe', description: 'Once' }, { operationKey: 'same' });
  const createAgain = await port.create('retry-safe', { title: 'Retry safe', description: 'Once' }, { operationKey: 'same' });
  assert.equal(createAgain.value.replayed, true); assert.equal(adapter.creates, 1);
  await port.transition('retry-safe', 'accepted', { actor: 'owner@company.test', actorKind: 'human', operationKey: 'accept-1' });
  const transitionAgain = await port.transition('retry-safe', 'accepted', { actor: 'owner@company.test', actorKind: 'human', operationKey: 'accept-1' });
  assert.equal(transitionAgain.value.replayed, true); assert.equal(adapter.transitions, 1);
  await port.link('retry-safe', 'pr', 'https://git.invalid/pr/1', { operationKey: 'pr-1' });
  const linkAgain = await port.link('retry-safe', 'pr', 'https://git.invalid/pr/1', { operationKey: 'pr-1' });
  assert.equal(linkAgain.value.replayed, true); assert.equal(adapter.links.size, 1);
  await port.comment('retry-safe', 'ready', { operationKey: 'comment-1' });
  const commentAgain = await port.comment('retry-safe', 'ready', { operationKey: 'comment-1' });
  assert.equal(commentAgain.value.replayed, true); assert.equal(adapter.comments.size, 1);
});

test('external intent drift invalidates verification without rewriting approval', async () => {
  const { port, adapter, cfg } = fixture();
  await port.create('drift', { title: 'Approved title', description: 'Approved outcome' }, { operationKey: 'create' });
  await port.transition('drift', 'accepted', { actor: 'owner@company.test', actorKind: 'human', operationKey: 'accept' });
  assert.equal((await port.verify('drift')).ok, true);
  adapter.issue.title = 'Materially changed after approval'; adapter.issue.revision = '3';
  const result = await port.verify('drift');
  assert.equal(result.ok, false); assert.equal(result.drift, true);
  const ref = JSON.parse(readFileSync(path.join(cfg.layout.intentRefs, 'drift.json'), 'utf8'));
  assert.equal(ref.decision.status, 'accepted');
  assert.notEqual(result.approved_digest, result.current_digest);
  await assert.rejects(() => requireCurrentExternalIntent(cfg, 'drift', { port }), /external intent drifted/);
});

test('authorization fails closed and agents cannot accept or close intent', async () => {
  const { port, adapter } = fixture();
  await port.create('human-gate', { title: 'Human gate', description: 'Must stay human' }, { operationKey: 'create' });
  const denied = await port.transition('human-gate', 'accepted', { actor: 'build-agent', actorKind: 'agent', operationKey: 'agent-accept' });
  assert.equal(denied.value.status, 'denied'); assert.equal(adapter.transitions, 0);
  await assert.rejects(() => port.transition('human-gate', 'accepted', { actor: '', actorKind: 'human', operationKey: 'anonymous' }), /requires actor/);
  const impersonated = await port.transition('human-gate', 'accepted', { actor: 'someone@company.test', actorKind: 'human', operationKey: 'impersonated' });
  assert.equal(impersonated.value.status, 'denied'); assert.equal(adapter.transitions, 0);
  await port.transition('human-gate', 'accepted', { actor: 'owner@company.test', actorKind: 'human', operationKey: 'human-accept' });
  const closeDenied = await port.transition('human-gate', 'closed', { actor: 'build-agent', actorKind: 'agent', operationKey: 'agent-close' });
  assert.equal(closeDenied.value.status, 'denied'); assert.equal(adapter.transitions, 1);
});
