// Three bounded outcomes on the existing text service. All fixture gates are simulations.
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { A } from './_paths.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const commit = root => { git(root, 'add', '-A'); git(root, '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Simulated coordination product trial'); };
export function edit(cfg, slug, kind, fn) {
  const file = a.file(cfg, slug, kind); writeFileSync(file, fn(readFileSync(file, 'utf8')));
}
export function metadata(cfg, slug, kind, values) {
  edit(cfg, slug, kind, text => { const { front, body } = a.parse(text); return a.render({ ...front, ...values }, body); });
}
export function product() {
  const s = stage(FIXTURES, 'contract-planned'), cfg = loadConfig(s.work);
  writeFileSync(`${s.work}/initiative.md`, '# Text service consumers\n\n## Acceptance criteria\n\n| Criterion ID | Criterion |\n|---|---|\n| local:api | Publish the text conversion contract |\n| local:portal | Display converted text |\n| local:report | Report conversion totals |\n| local:integration | Consumers agree with the shared contract |\n');
  commit(s.work);
  const revision = git(s.work, 'rev-parse', 'HEAD');
  for (const [slug, criterion, scope, outcome] of [
    ['text-contract', 'api', 'src/app/', 'Publish the existing conversion contract for consumers.'],
    ['text-portal', 'portal', 'src/app/text.py', 'Display converted text using the reviewed conversion contract.'],
    ['text-report', 'report', 'src/report.py', 'Report request totals independently of title casing.'],
  ]) {
    a.create(cfg, slug, `${A}/templates`);
    writeFileSync(a.file(cfg, slug, 'intent'), a.render({ status: 'draft', parent: 'TEXT-100', source: 'initiative.md', source_revision: revision,
      tracker: `https://example.invalid/issues/${slug}`, assignee: `${slug}-owner`, iteration: 'sprint-1' }, `# Intent\n\n${outcome}\n`));
    writeFileSync(a.file(cfg, slug, 'spec'), a.render({ status: 'draft' }, `# Spec\n\n## Outcome\n\n${outcome}\n\n### B1\n\nGiven a service consumer, when this outcome is requested, then ${outcome}\n\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n| local:${criterion} | B1 |\n`));
    writeFileSync(a.file(cfg, slug, 'plan'), a.render({ status: 'draft', ...(slug === 'text-contract' ? {} : { depends_on: 'text-contract' }) },
      `# Plan\n\n## Approach\n\nUse the existing service boundary.\n\n## Files\n\n- \`${scope}\`\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n| B1 | Product observation for ${slug} |\n` + (slug === 'text-contract' ? '' : `\n## Dependencies\n\n| Change | Interface | Revision |\n|---|---|---|\n| text-contract | src/app/text.py | ${revision} |\n`)));
  }
  commit(s.work);
  return { ...s, cfg, revision, approve(slug) {
    for (const kind of ['spec', 'plan']) { a.approve(cfg, slug, kind, { by: 'simulated-product-reviewer' }); commit(s.work); }
  } };
}
