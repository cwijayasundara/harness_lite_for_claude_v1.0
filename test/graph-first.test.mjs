// graph-first-retrieval: the index is the first lookup, Grep is the miss path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { A, C, ROOT } from './_paths.mjs';

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, 'missing frontmatter');
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
};

test('B1 explorer can run graph lookup and still cannot write', () => {
  const md = read('.aidlc/roles/explorer.md');
  const contract = JSON.parse(read('.aidlc/roles/explorer.contract.json'));
  const tools = (frontmatter(md).tools ?? '').split(',').map((s) => s.trim());
  assert.deepEqual(tools, contract.tools);
  assert.ok(tools.includes('Bash'), 'explorer must be able to run harness graph query / pack');
  for (const t of ['Read', 'Grep', 'Glob']) assert.ok(tools.includes(t), t);
  assert.equal(contract.may_write, false);
  assert.ok(!tools.includes('Write') && !tools.includes('Edit'));
  assert.match(md, /harness graph query/);
  assert.match(md, /harness pack/);
  assert.match(md, /first|before/i);
  assert.match(md, /miss/i);
  assert.doesNotMatch(md, /\bWrite\b|\bEdit\b/);
});

test('B2 steering names graph/pack first and Grep as the miss path', () => {
  const surfaces = {
    instructions: read('.aidlc/instructions.md'),
    claude: read('.claude/CLAUDE.md'),
    map: read('.aidlc/skills/map/SKILL.md'),
    implement: read('.aidlc/skills/implement/SKILL.md'),
  };
  for (const [name, text] of Object.entries(surfaces)) {
    assert.doesNotMatch(text, /CRITICAL|YOU MUST NEVER GREP/, name);
  }
  assert.match(surfaces.instructions, /graph query/);
  assert.match(surfaces.instructions, /pack/);
  assert.match(surfaces.instructions, /miss path|miss,/i);
  assert.match(surfaces.claude, /graph query/);
  assert.match(surfaces.map, /graph query/);
  assert.match(surfaces.map, /pack/);
  assert.match(surfaces.map, /miss/i);
  assert.doesNotMatch(surfaces.map, /unavailable optional graph does not block/i);
  assert.doesNotMatch(surfaces.map, /use the\s+graph when it helps/i);
  assert.match(surfaces.implement, /pack|graph query/);
  assert.match(surfaces.change, /pack|graph query|callers/);
});

test('B3 Grep stays allowed; preSearch does not dump a pack', () => {
  const dispatch = read('.aidlc/hooks/dispatch.mjs');
  assert.match(dispatch, /tool === 'Grep' \|\| tool === 'Glob'/);
  assert.match(dispatch, /return preSearch/);
  const fn = dispatch.slice(dispatch.indexOf('function preSearch'), dispatch.indexOf('export async function dispatch'));
  assert.doesNotMatch(fn, /permissionDecision:\s*'deny'/);
  assert.doesNotMatch(fn, /renderPack|# context pack/);
  assert.match(fn, /additionalContext/);
  assert.match(fn, /graph query callers/);
  const miss = read('.aidlc/bin/harness');
  assert.match(miss, /fall back to: grep -rn/);
});

test('B4 lean-review row freezes expansion and repairs usage', () => {
  const plan = read('docs/IMPROVEMENT-PLAN.md');
  const row = plan.split('\n').find((l) => l.startsWith('| Graph, map and context packing |'));
  assert.ok(row, 'lean-review graph row missing');
  assert.match(row, /freeze/i);
  assert.match(row, /repair usage|graph-first/i);
  assert.doesNotMatch(row, /First removal experiment/);
  const limits = read('.aidlc/harness.toml');
  assert.match(limits, /^agents\s*=\s*3$/m);
  assert.equal(JSON.parse(read('.claude-plugin/plugin.json')).agents.length, 3);
});
