// graph-first-retrieval: the index is the first lookup, Grep is the miss path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { A, C, ROOT } from './_paths.mjs';
import { renderClaudeInstructions } from '../.claude/harness/lib/projection.mjs';

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
test('B1 optional graph lookup does not require a shipped explorer agent', () => {
  assert.equal(existsSync(path.join(A, 'roles/explorer.md')), false);
  assert.equal(existsSync(path.join(A, 'roles/explorer.contract.json')), false);
  const agents = JSON.parse(read('.claude-plugin/plugin.json')).agents;
  assert.deepEqual(agents.map((p) => path.basename(p, '.md')).sort(), ['evaluator', 'verifier']);
});

// The Claude surface is the projection a *consumer* project gets, rendered from the canonical
// instructions. This repository's own .claude/CLAUDE.md is deliberately a short non-activating
// stub — reading it here would test the harness source repo's wiring, not the steering shipped.
test('B2 steering names graph/pack first and Grep as the miss path', () => {
  const surfaces = {
    instructions: read('.claude/harness/instructions.md'),
    claude: renderClaudeInstructions(read('.claude/harness/instructions.md')),

    implement: read('.claude/harness/skills/implement/SKILL.md'),
  };
  for (const [name, text] of Object.entries(surfaces)) {
    assert.doesNotMatch(text, /CRITICAL|YOU MUST NEVER GREP/, name);
  }
  assert.match(surfaces.instructions, /graph query/);
  assert.match(surfaces.instructions, /pack/);
  assert.match(surfaces.instructions, /miss path|miss,/i);
  assert.match(surfaces.claude, /graph query/);
  // G16 folded the `map` skill into `## Finding your way around` in the instructions, which every
  // session loads — standing advice belongs where it is always read, not behind an invocation.
  assert.match(surfaces.instructions, /## Finding your way around/);
  assert.match(surfaces.instructions, /cache, not an authority/);
  assert.doesNotMatch(surfaces.instructions, /unavailable optional graph does not block/i);
  assert.doesNotMatch(surfaces.instructions, /use the\s+graph when it helps/i);
  assert.match(surfaces.implement, /pack|graph query/);
});

test('B3 Grep stays native and graph advice is not in the hot hook path', () => {
  const dispatch = read('.claude/harness/hooks/dispatch.mjs');
  assert.doesNotMatch(dispatch, /function preSearch|return preSearch/);
  const hooks = JSON.parse(read('.claude/harness/hooks.json'));
  assert.doesNotMatch(hooks.hooks.PreToolUse[0].matcher, /Grep|Glob|Read/);
  const miss = read('.claude/harness/bin/harness');
  assert.match(miss, /fall back to: grep -rn/);
});

test('B4 lean-review row freezes expansion and repairs usage', () => {
  const plan = read('docs/IMPROVEMENT-PLAN.md');
  const row = plan.split('\n').find((l) => l.startsWith('| Graph, map and context packing |'));
  assert.ok(row, 'lean-review graph row missing');
  assert.match(row, /freeze/i);
  assert.match(row, /repair usage|graph-first/i);
  assert.doesNotMatch(row, /First removal experiment/);
  const limits = read('.claude/harness/harness.toml');
  assert.match(limits, /^agents\s*=\s*2$/m);
  assert.equal(JSON.parse(read('.claude-plugin/plugin.json')).agents.length, 2);
});
