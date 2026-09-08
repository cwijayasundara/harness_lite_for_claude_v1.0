// All gate and host decisions in this disposable fixture are explicitly simulated.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as a from '../.aidlc/lib/artifacts.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { A } from './_paths.mjs';
import { traceEvidence } from '../.aidlc/lib/trace.mjs';

export function productFixture(existingRoot = null) {
  const root = existingRoot ?? mkdtempSync(path.join(tmpdir(), 'product-context-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  const commit = message => { git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', message); return git('rev-parse', 'HEAD'); };
  if (!existingRoot) {
    git('init', '-q'); git('config', 'user.name', 'Simulated reviewer'); git('config', 'user.email', 'simulated@example.invalid');
    write('.aidlc/harness.toml', '[project]\nname = "context-fixture"\n');
    write('.gitignore', '.aidlc/state/\n__pycache__/\n.pytest_cache/\n');
  }
  write('requirements.md', '# Name display\n\n## Acceptance criteria\n\n| Criterion ID | Criterion |\n|---|---|\n| names | Render mary-jane watson as Mary-Jane Watson; preserve space-separated names. |\n');
  const source = commit('Simulated original requirement');
  const cfg = loadConfig(root);
  let pr = 0;
  function prepare(slug, { supersedes, extends: continuity, sourceRevision = source, rule = 'Given mary-jane watson, when titlecase runs, then return Mary-Jane Watson and preserve space-separated names.', files = ['src/app/text.py', 'tests/test_rule.py'], design = 'Keep titlecase pure in the text helper.' } = {}) {
    const base = git('rev-parse', 'HEAD');
    a.create(cfg, slug, path.join(A, 'templates'));
    write(`${path.relative(root, a.file(cfg, slug, 'intent'))}`, a.render({ status: 'draft', source: 'requirements.md', source_revision: sourceRevision }, '# Intent\n\nDisplay names using the current requested casing rule.\n'));
    write(path.relative(root, a.file(cfg, slug, 'spec')), a.render({ status: 'draft', supersedes, extends: continuity }, `# Spec: ${slug}\n\n## Outcome\n\nName formatting follows the requested rule.\n\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n| names | B1 |\n\n## Observable behaviours\n\n### B1\n\n${rule}\n\n## Design\n\n${design}\n\n## Out of scope\n\nOther user profile behavior.\n\n## Safeguards\n\nPreserve the public titlecase signature and space handling.\n`));
    write(path.relative(root, a.file(cfg, slug, 'plan')), a.render({ status: 'draft' }, `# Plan\n\n## Approach\n\nUpdate the pure formatting helper and its regression assertion.\n\n## Files\n\n${files.map(f => '- `'+f+'`').join('\n')}\n\n## Order\n\n1. Update formatting and run the name assertion.\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n| B1 | \`tests/test_rule.py::test_rule\` |\n`));
    commit('Simulated contract drafts');
    a.approve(cfg, slug, 'spec', { by: 'simulated-fixture-reviewer' });
    a.approve(cfg, slug, 'plan', { by: 'simulated-fixture-reviewer' });
    commit('Simulated contract approvals');
    return { slug, base };
  }
  function report(change, candidate, controls = [{ control: 'scope-drift', verdict: 'pass' }]) {
    const trace = traceEvidence({ ...cfg, diff: { base: change.base, candidate }, checkChange: change.slug }, controls, { validCandidate: true });
    return { stage: 'fixture-simulation', revision: { base: change.base, candidate, change: change.slug }, trace,
      ok: controls.every(c => ['pass', 'skipped'].includes(c.verdict)), changed_files: [], controls };
  }
  function record(change, { candidate = git('rev-parse', 'HEAD'), merge = candidate, controls, checkReport, hostEdit, recordEdit } = {}) {
    const directory = `.aidlc/artifacts/${change.slug}`;
    const checks = `${directory}/candidate-check.json`, host_review = `${directory}/host-review.json`;
    const number = ++pr;
    const observed = '2026-09-08T12:00:00.000Z';
    const host = { version: 1, repository: 'simulation/names', pr: number, candidate, provenance: 'simulated-transport',
      assessment: 'policy-unavailable', verified: false,
      host: { number, headRefOid: candidate, state: 'MERGED', mergedAt: observed, mergeCommit: { oid: merge } }, delivery: { merge, merged_at: observed } };
    hostEdit?.(host);
    write(checks, JSON.stringify(checkReport ?? report(change, candidate, controls)));
    write(host_review, JSON.stringify(host));
    const r = { version: 1, change: change.slug, repository: 'simulation/names', pr: number, base: change.base, candidate, merge, checks, host_review };
    recordEdit?.(r);
    write(`${directory}/delivery.json`, JSON.stringify(r));
    const catalog = commit('Simulated archived delivery observations');
    return { ...r, catalog };
  }
  function code(value = 'Mary-Jane Watson') {
    write('src/app/text.py', `def titlecase(value: str) -> str:\n    return ${JSON.stringify(value)}\n`);
    write('tests/test_rule.py', `import runpy\n\ndef test_rule():\n    assert runpy.run_path("src/app/text.py")["titlecase"]("mary-jane watson") == ${JSON.stringify(value)}\n`);
    return commit('Product rule and assertion');
  }
  return { root, cfg, git, write, commit, prepare, report, record, code, source,
    cleanup: () => { if (!existingRoot) rmSync(root, { recursive: true, force: true }); } };
}
