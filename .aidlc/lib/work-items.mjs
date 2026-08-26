import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { JiraAdapter } from '../providers/jira.mjs';
import { decideIntentRef, snapshotDigest, validateIntentRef, writeIntentRef } from './contract.mjs';

const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const allowedOperations = ['resolve', 'snapshot', 'verify', 'create', 'transition', 'link_commit', 'link_contract', 'link_pr', 'comment'];

export function intentSnapshot(item) {
  return { provider: item.provider, locator: item.locator, title: item.title, description: item.description, project: item.project, issue_type: item.issue_type };
}

export function validateReceipt(value) {
  const issues = [];
  if (value?.schema !== 'aidlc.work-item-receipt/v1') issues.push('receipt schema must be aidlc.work-item-receipt/v1');
  if (!allowedOperations.includes(value?.operation)) issues.push('receipt operation is invalid');
  if (!['succeeded', 'failed', 'denied', 'drifted'].includes(value?.status)) issues.push('receipt status is invalid');
  if (typeof value?.operation_key !== 'string' || !value.operation_key) issues.push('receipt operation_key is required');
  if (!Number.isFinite(Date.parse(value?.created_at))) issues.push('receipt created_at must be an ISO date-time');
  return issues;
}

function writeReceipt(cfg, value) {
  const issues = validateReceipt(value); if (issues.length) throw new Error(issues.join('; '));
  mkdirSync(cfg.layout.workItemReceipts, { recursive: true });
  const file = path.join(cfg.layout.workItemReceipts, `${Date.now()}-${value.operation}-${sha(value.operation_key).slice(7, 19)}-${value.receipt_id.slice(0, 8)}.json`);
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  return file;
}

export function workItemAdapter(cfg, options = {}) {
  if (cfg.work_items.provider !== 'jira') throw new Error(`unsupported work-item provider ${cfg.work_items.provider || '(not configured)'}`);
  const adapter = new JiraAdapter(cfg.work_items, options);
  if (options.validate !== false) { const issues = adapter.doctor(); if (issues.length) throw new Error(issues.join('; ')); }
  return adapter;
}

export class WorkItemPort {
  constructor(cfg, { adapter, now = () => new Date(), principal = process.env.HARNESS_ACTOR } = {}) { this.cfg = cfg; this.adapter = adapter ?? workItemAdapter(cfg); this.now = now; this.principal = principal; }

  #key(operation, slug, supplied) {
    if (typeof supplied !== 'string' || !supplied.trim()) throw new Error(`${operation} requires an explicit idempotency key`);
    return `${this.cfg.project.name}:${slug}:${operation}:${supplied}`;
  }

  #receipt(operation, operationKey, status, details = {}) {
    const value = { schema: 'aidlc.work-item-receipt/v1', receipt_id: randomUUID(), operation, operation_key: operationKey, provider: 'jira', status, created_at: this.now().toISOString(), ...details };
    return { value, file: writeReceipt(this.cfg, value) };
  }

  #ref(slug) { return path.join(this.cfg.layout.intentRefs, `${slug}.json`); }
  #snapshotFile(slug) { return path.join(this.cfg.layout.workItems, `${slug}.json`); }

  async resolve(locator) { return this.adapter.resolve(locator); }

  async snapshot(slug, { write = true } = {}) {
    const ref = JSON.parse(readFileSync(this.#ref(slug), 'utf8'));
    if (ref.source.authority !== 'external' || ref.source.provider !== 'jira') throw new Error('snapshot requires one external Jira authority');
    const item = await this.adapter.resolve(ref.source.locator); const snapshot = intentSnapshot(item); const digest = snapshotDigest(stable(snapshot));
    const value = { schema: 'aidlc.work-item-snapshot/v1', change_id: slug, source: { provider: 'jira', locator: item.locator, revision: item.revision }, snapshot_digest: digest, captured_at: this.now().toISOString(), intent: snapshot };
    if (write) { mkdirSync(this.cfg.layout.workItems, { recursive: true }); writeFileSync(this.#snapshotFile(slug), JSON.stringify(value, null, 2) + '\n'); }
    return value;
  }

  async verify(slug) {
    const ref = JSON.parse(readFileSync(this.#ref(slug), 'utf8')); const issues = validateIntentRef(ref);
    if (issues.length) throw new Error(issues.join('; '));
    const current = await this.snapshot(slug, { write: false });
    const drift = ref.snapshot_digest !== current.snapshot_digest;
    return { schema: 'aidlc.work-item-verification/v1', change_id: slug, ok: !drift, drift, approved_digest: ref.snapshot_digest, current_digest: current.snapshot_digest, approved_revision: ref.source.revision, current_revision: current.source.revision };
  }

  async create(slug, input, { operationKey }) {
    const key = this.#key('create', slug, operationKey); const refFile = this.#ref(slug);
    try {
      const result = await this.adapter.create(input, key);
      if (!existsSync(refFile)) writeIntentRef(refFile, { id: slug, provider: 'jira', locator: result.item.locator, revision: 'pending', authority: 'external' });
      else {
        const ref = JSON.parse(readFileSync(refFile, 'utf8'));
        if (ref.source.provider !== 'jira' || ref.source.locator !== result.item.locator) throw new Error('existing intent ref points to a different work item');
      }
      return this.#receipt('create', key, 'succeeded', { change_id: slug, locator: result.item.locator, replayed: result.replayed });
    } catch (error) { this.#receipt('create', key, 'failed', { change_id: slug, error: error.message }); throw error; }
  }

  async transition(slug, state, { actor, actorKind, operationKey }) {
    const key = this.#key('transition', slug, operationKey);
    if (!['accepted', 'closed'].includes(state)) throw new Error('semantic transition must be accepted or closed');
    if (!actor || !['human', 'agent'].includes(actorKind)) throw new Error('transition requires actor and actor-kind human|agent');
    if (actorKind === 'agent') { const denied = this.#receipt('transition', key, 'denied', { change_id: slug, actor, actor_kind: actorKind, target: state, error: 'agents cannot accept or close intent' }); return denied; }
    if (!this.principal || actor !== this.principal || !(this.cfg.work_items.approvers ?? []).includes(actor)) {
      return this.#receipt('transition', key, 'denied', { change_id: slug, actor, actor_kind: actorKind, target: state, error: 'actor is not a verified configured approver' });
    }
    const refFile = this.#ref(slug); const ref = JSON.parse(readFileSync(refFile, 'utf8'));
    if (ref.decision?.status === state) return this.#receipt('transition', key, 'succeeded', { change_id: slug, locator: ref.source.locator, actor, actor_kind: actorKind, target: state, replayed: true });
    const target = state === 'accepted' ? this.cfg.work_items.accepted_status : this.cfg.work_items.closed_status;
    try {
      const result = await this.adapter.transition(ref.source.locator, target);
      const snap = await this.snapshot(slug);
      decideIntentRef(refFile, { status: state, by: actor, revision: snap.source.revision, snapshot_digest: snap.snapshot_digest, now: this.now() });
      return this.#receipt('transition', key, 'succeeded', { change_id: slug, locator: ref.source.locator, actor, actor_kind: actorKind, target: state, replayed: result.replayed });
    } catch (error) { this.#receipt('transition', key, 'failed', { change_id: slug, actor, target: state, error: error.message }); throw error; }
  }

  async link(slug, kind, url, { title, operationKey }) {
    if (!['commit', 'contract', 'pr'].includes(kind)) throw new Error('link kind must be commit, contract, or pr');
    if (!/^https:\/\//.test(url)) throw new Error('link URL must be https');
    const operation = `link_${kind}`; const key = this.#key(operation, slug, operationKey); const ref = JSON.parse(readFileSync(this.#ref(slug), 'utf8'));
    try { const result = await this.adapter.link(ref.source.locator, kind, url, title ?? `${kind}: ${slug}`, key); return this.#receipt(operation, key, 'succeeded', { change_id: slug, locator: ref.source.locator, url, ...result }); }
    catch (error) { this.#receipt(operation, key, 'failed', { change_id: slug, error: error.message }); throw error; }
  }

  async comment(slug, body, { operationKey }) {
    if (typeof body !== 'string' || !body.trim()) throw new Error('comment body is required');
    const key = this.#key('comment', slug, operationKey); const ref = JSON.parse(readFileSync(this.#ref(slug), 'utf8'));
    try { const result = await this.adapter.comment(ref.source.locator, body, key); return this.#receipt('comment', key, 'succeeded', { change_id: slug, locator: ref.source.locator, ...result }); }
    catch (error) { this.#receipt('comment', key, 'failed', { change_id: slug, error: error.message }); throw error; }
  }
}

export async function requireCurrentExternalIntent(cfg, slug, { port } = {}) {
  const file = path.join(cfg.layout.intentRefs, `${slug}.json`);
  if (!existsSync(file)) throw new Error(`intent ref not found for ${slug}`);
  const ref = JSON.parse(readFileSync(file, 'utf8'));
  if (ref.source?.authority === 'git') return { ok: true, authority: 'git' };
  if (ref.source?.authority !== 'external') throw new Error('intent must declare exactly one external or git authority');
  const result = await (port ?? new WorkItemPort(cfg)).verify(slug);
  if (!result.ok) throw new Error(`external intent drifted: approved ${result.approved_digest}, current ${result.current_digest}`);
  return result;
}
