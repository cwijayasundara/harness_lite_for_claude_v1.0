import { createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const marker = (key) => `aidlc-${digest(key).slice(0, 24)}`;
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

function adfText(value) {
  if (typeof value === 'string') return value;
  const out = [];
  const walk = (node) => { if (!node) return; if (typeof node.text === 'string') out.push(node.text); for (const child of node.content ?? []) walk(child); };
  walk(value); return out.join('\n');
}

export class JiraAdapter {
  constructor(config, { request } = {}) {
    this.config = config;
    this.request = request ?? this.#request.bind(this);
  }

  doctor() {
    const issues = [];
    if (this.config.provider !== 'jira') issues.push('work_items.provider must be jira');
    if (!/^https:\/\//.test(this.config.base_url ?? '')) issues.push('work_items.base_url must be https');
    if (!this.config.project_key) issues.push('work_items.project_key is required');
    else if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(this.config.project_key)) issues.push('work_items.project_key has an unsafe Jira key');
    if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) issues.push('JIRA_EMAIL and JIRA_API_TOKEN are required');
    return issues;
  }

  async #request(method, pathname, body = undefined) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(this.config.timeout_ms ?? 30000));
    try {
      const response = await fetch(`${this.config.base_url.replace(/\/$/, '')}${pathname}`, {
        method, signal: controller.signal,
        headers: { Authorization: `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text(); let value = null;
      try { value = text ? JSON.parse(text) : null; } catch { value = text; }
      if (!response.ok) throw new Error(`Jira ${method} ${pathname} returned ${response.status}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
      return value;
    } finally { clearTimeout(timeout); }
  }

  normalize(issue) {
    return {
      provider: 'jira', locator: issue.key, revision: issue.fields?.updated ?? String(issue.id),
      title: issue.fields?.summary ?? '', description: adfText(issue.fields?.description),
      status: issue.fields?.status?.name ?? '', project: issue.fields?.project?.key ?? this.config.project_key,
      issue_type: issue.fields?.issuetype?.name ?? this.config.issue_type ?? 'Story',
    };
  }

  async resolve(locator) {
    return this.normalize(await this.request('GET', `/rest/api/3/issue/${encodeURIComponent(locator)}?fields=summary,description,status,updated,project,issuetype`));
  }

  async create(input, key) {
    const label = marker(key);
    const search = await this.request('POST', '/rest/api/3/search/jql', { jql: `project = ${this.config.project_key} AND labels = ${label}`, fields: ['summary', 'description', 'status', 'updated', 'project', 'issuetype'], maxResults: 2 });
    if ((search.issues ?? []).length > 1) throw new Error(`Jira idempotency marker ${label} is not unique`);
    if (search.issues?.length === 1) return { item: this.normalize(search.issues[0]), replayed: true };
    const created = await this.request('POST', '/rest/api/3/issue', { fields: {
      project: { key: this.config.project_key }, issuetype: { name: input.issue_type ?? this.config.issue_type ?? 'Story' },
      summary: input.title, description: adf(input.description), labels: [...new Set([...(input.labels ?? []), label])],
    } });
    return { item: await this.resolve(created.key), replayed: false };
  }

  async transition(locator, target) {
    const item = await this.resolve(locator);
    if (item.status.toLowerCase() === target.toLowerCase()) return { item, replayed: true };
    const values = await this.request('GET', `/rest/api/3/issue/${encodeURIComponent(locator)}/transitions`);
    const transition = (values.transitions ?? []).find((value) => value.name?.toLowerCase() === target.toLowerCase() || value.to?.name?.toLowerCase() === target.toLowerCase());
    if (!transition) throw new Error(`Jira transition to ${target} is unavailable from ${item.status}`);
    await this.request('POST', `/rest/api/3/issue/${encodeURIComponent(locator)}/transitions`, { transition: { id: transition.id } });
    return { item: await this.resolve(locator), replayed: false };
  }

  async link(locator, kind, url, title, key) {
    const globalId = `aidlc://${kind}/${digest(key)}`;
    await this.request('POST', `/rest/api/3/issue/${encodeURIComponent(locator)}/remotelink`, { globalId, object: { url, title } });
    return { global_id: globalId, replayed: false };
  }

  async comment(locator, body, key) {
    const token = `[aidlc:${digest(key)}]`;
    let startAt = 0;
    for (;;) {
      const values = await this.request('GET', `/rest/api/3/issue/${encodeURIComponent(locator)}/comment?maxResults=100&startAt=${startAt}&orderBy=-created`);
      const comments = values.comments ?? []; const existing = comments.find((comment) => adfText(comment.body).includes(token));
      if (existing) return { id: String(existing.id), replayed: true };
      startAt += comments.length;
      if (comments.length < 100 || (Number.isFinite(values.total) && startAt >= values.total)) break;
    }
    const created = await this.request('POST', `/rest/api/3/issue/${encodeURIComponent(locator)}/comment`, { body: adf(`${body}\n\n${token}`) });
    return { id: String(created.id), replayed: false };
  }
}
