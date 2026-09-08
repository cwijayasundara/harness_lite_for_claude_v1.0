// limit-coordination-context: keep demonstrated D/E needs; do not grow a delivery platform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BIN, ROOT } from './_paths.mjs';
import { product } from './_coordination-product.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';

const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const cli = (cwd, ...args) => execFileSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('B2 selected status is that change slice; slug still filters; no selection keeps the full view', () => {
  const s = product();
  try {
    cli(s.work, 'status', '--clear-change');
    const full = JSON.parse(cli(s.work, 'status', '--json')).coordination;
    assert.ok(full.children.length >= 3, 'unselected status keeps the full local coordination view');

    cli(s.work, 'status', '--change', 'text-portal');
    const selected = JSON.parse(cli(s.work, 'status', '--json')).coordination;
    assert.equal(selected.children.length, 1);
    assert.equal(selected.children[0].change, 'text-portal');
    assert.equal(selected.parents[0].children.length, 3);
    assert.ok(selected.overlaps.some(row => row.changes.includes('text-contract')));
    assert.ok(!selected.children.some(c => c.change === 'text-report'));
    assert.equal(a.currentChange(s.cfg).slug, 'text-portal');

    const named = JSON.parse(cli(s.work, 'status', 'text-report', '--json')).coordination;
    assert.equal(named.children.length, 1);
    assert.equal(named.children[0].change, 'text-report');
    assert.equal(a.currentChange(s.cfg).slug, 'text-portal', 'a slug argument does not steal selection');

    cli(s.work, 'status', '--clear-change');
    assert.ok(JSON.parse(cli(s.work, 'status', '--json')).coordination.children.length >= 3);
  } finally { s.cleanup(); }
});

test('B3 product query still needs an exact revision; delivery keys and pack options stay frozen', () => {
  const harness = read('.aidlc/bin/harness');
  const lib = read('.aidlc/lib/product-context.mjs');
  assert.match(harness, /question === 'product'/);
  assert.match(harness, /context requires --revision <commit>/);
  assert.match(lib, /git grep -n -F -e <term> \$\{requested\} -- <path>; git show \$\{requested\}:<path>/);
  assert.match(lib, /const keys = \['version', 'change', 'repository', 'pr', 'base', 'candidate', 'merge', 'checks', 'host_review', 'integrated_checks'\]/);
  assert.match(harness, /\['revision', 'records', 'json', \.\.\.\(packing \? \['budget'\] : \[\]\)\]/);
  assert.doesNotMatch(harness, /case 'schedule'|case 'assign'/);
});

test('B4 steering prefers tracker links and git show/git grep over a local delivery platform', () => {
  const surfaces = {
    instructions: read('.aidlc/instructions.md'),
    claude: read('.claude/CLAUDE.md'),
    intent: read('.aidlc/skills/intent/SKILL.md'),
    plan: read('.aidlc/skills/plan/SKILL.md'),
    map: read('.aidlc/skills/map/SKILL.md'),
    review: read('.aidlc/policies/review.md'),
    readme: read('README.md'),
    template: read('.aidlc/templates/intent.md'),
  };
  for (const name of ['instructions', 'claude', 'map', 'review', 'readme']) {
    assert.match(surfaces[name], /git show/, name);
    assert.match(surfaces[name], /git grep/, name);
  }
  for (const name of ['intent', 'plan', 'readme', 'template']) {
    assert.match(surfaces[name], /tracker/, name);
  }
  assert.match(surfaces.map, /only when delivery records already\s+exist/);
  assert.doesNotMatch(surfaces.map, /pack <symbol-or-path> --revision/);
  assert.match(surfaces.readme, /not a delivery platform|not an assignment/i);
  const row = read('docs/IMPROVEMENT-PLAN.md').split('\n')
    .find(l => l.startsWith('| Coordination and revision-specific product context |'));
  assert.ok(row, 'lean-review coordination row missing');
  assert.match(row, /demonstrated/i);
  assert.match(row, /tracker/i);
  assert.match(row, /git/i);
  assert.match(row, /no scheduler/i);
  assert.match(row, /selected-change|selected change|status slice/i);
});

test('B5 no scheduler or assignment verb; control budget unchanged', () => {
  const help = execFileSync(process.execPath, [BIN], { encoding: 'utf8' });
  assert.doesNotMatch(help, /\bschedule\b|\bassign\b/);
  const limits = read('.aidlc/harness.toml');
  assert.match(limits, /^skills\s*=\s*7$/m);
  assert.match(limits, /^agents\s*=\s*3$/m);
  assert.match(limits, /^hooks\s*=\s*5$/m);
  assert.equal(JSON.parse(read('.claude-plugin/plugin.json')).agents.length, 3);
});
