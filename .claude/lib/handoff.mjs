import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lifecycle } from './lifecycle.mjs';

export function handoffActions(cfg) {
  return lifecycle(cfg).flatMap((row) => {
    if (row.artifacts.intent?.approved_at && !row.artifacts.spec) return [{ slug: row.slug, from: 'intent', to: 'spec' }];
    if (row.artifacts.spec?.approved_at && !row.artifacts.plan) return [{ slug: row.slug, from: 'spec', to: 'plan' }];
    return [];
  });
}

export function applyHandoff(cfg, { templateDir, write = false, now = new Date() } = {}) {
  const actions = handoffActions(cfg);
  const created = [];
  if (!write) return { actions, created };
  if (!templateDir) throw new Error('handoff --write requires templateDir');
  for (const action of actions) {
    const dir = cfg.layout[action.to];
    mkdirSync(dir, { recursive: true });
    const dst = path.join(dir, `${action.slug}.md`);
    if (existsSync(dst)) continue;
    const tpl = readFileSync(path.join(templateDir, `${action.to}.md`), 'utf8')
      .replaceAll('{{slug}}', action.slug)
      .replaceAll('{{date}}', now.toISOString().slice(0, 10))
      .replaceAll('{{timestamp}}', now.toISOString());
    writeFileSync(dst, tpl);
    created.push({ slug: action.slug, kind: action.to, file: dst });
  }
  return { actions, created };
}
