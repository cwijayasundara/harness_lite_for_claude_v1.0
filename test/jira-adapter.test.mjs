import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JiraAdapter } from '../.aidlc/providers/jira.mjs';

function backend() {
  const state = { issues: [], creates: 0, transitions: 0, links: new Map(), comments: [] };
  const issue = (key, fields) => ({ id: String(state.issues.length + 1), key, fields: { updated: '2026-08-26T10:00:00.000+0000', status: { name: 'Draft' }, project: { key: 'POD' }, issuetype: { name: 'Story' }, ...fields } });
  const request = async (method, pathname, body) => {
    if (method === 'POST' && pathname === '/rest/api/3/search/jql') {
      const label = body.jql.match(/labels = ([^ ]+)$/)?.[1]; return { issues: state.issues.filter((item) => item.fields.labels?.includes(label)) };
    }
    if (method === 'POST' && pathname === '/rest/api/3/issue') {
      state.creates++; const value = issue(`POD-${state.issues.length + 1}`, body.fields); state.issues.push(value); return { key: value.key };
    }
    const key = decodeURIComponent(pathname.match(/\/issue\/([^/?]+)/)?.[1] ?? ''); const value = state.issues.find((item) => item.key === key);
    if (method === 'GET' && /\?fields=/.test(pathname)) return value;
    if (method === 'GET' && pathname.endsWith('/transitions')) return { transitions: [{ id: '17', name: 'Accepted', to: { name: 'Accepted' } }] };
    if (method === 'POST' && pathname.endsWith('/transitions')) { state.transitions++; value.fields.status.name = 'Accepted'; value.fields.updated = '2026-08-26T10:01:00.000+0000'; return null; }
    if (method === 'POST' && pathname.endsWith('/remotelink')) { state.links.set(body.globalId, body); return { id: String(state.links.size) }; }
    if (method === 'GET' && pathname.includes('/comment?')) return { comments: state.comments };
    if (method === 'POST' && pathname.endsWith('/comment')) { const comment = { id: String(state.comments.length + 1), body: body.body }; state.comments.push(comment); return comment; }
    throw new Error(`unexpected ${method} ${pathname}`);
  };
  return { state, request };
}

test('Jira adapter provides provider-level idempotency for every write shape', async () => {
  const fake = backend(); const adapter = new JiraAdapter({ provider: 'jira', project_key: 'POD', issue_type: 'Story' }, { request: fake.request });
  const first = await adapter.create({ title: 'Pay safely', description: 'Customer outcome' }, 'pilot:pay:create:1');
  const again = await adapter.create({ title: 'Pay safely', description: 'Customer outcome' }, 'pilot:pay:create:1');
  assert.equal(first.replayed, false); assert.equal(again.replayed, true); assert.equal(fake.state.creates, 1);

  const moved = await adapter.transition(first.item.locator, 'Accepted');
  const movedAgain = await adapter.transition(first.item.locator, 'Accepted');
  assert.equal(moved.replayed, false); assert.equal(movedAgain.replayed, true); assert.equal(fake.state.transitions, 1);

  await adapter.link(first.item.locator, 'pr', 'https://git.invalid/pr/7', 'PR 7', 'pilot:pay:pr:7');
  await adapter.link(first.item.locator, 'pr', 'https://git.invalid/pr/7', 'PR 7', 'pilot:pay:pr:7');
  assert.equal(fake.state.links.size, 1);

  const comment = await adapter.comment(first.item.locator, 'Evidence ready', 'pilot:pay:comment:ready');
  const commentAgain = await adapter.comment(first.item.locator, 'Evidence ready', 'pilot:pay:comment:ready');
  assert.equal(comment.replayed, false); assert.equal(commentAgain.replayed, true); assert.equal(fake.state.comments.length, 1);
});

test('Jira normalization snapshots intent-bearing fields and excludes mutable discussion', async () => {
  const adapter = new JiraAdapter({ provider: 'jira', project_key: 'POD' }, { request: async () => ({
    id: '9', key: 'POD-9', fields: { summary: 'Outcome', description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }, { type: 'text', text: 'Second' }] }] }, status: { name: 'Draft' }, updated: 'rev-4', project: { key: 'POD' }, issuetype: { name: 'Story' } },
  }) });
  assert.deepEqual(await adapter.resolve('POD-9'), { provider: 'jira', locator: 'POD-9', revision: 'rev-4', title: 'Outcome', description: 'First\nSecond', status: 'Draft', project: 'POD', issue_type: 'Story' });
});
