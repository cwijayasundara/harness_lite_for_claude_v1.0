// a-whole-file-read-is-the-last-resort: the index is the first lookup for Read too.
//
// `preSearch` already tells a Grep that the graph has the answer, advisory because a refused
// search is one people learn to route around. A whole-file Read is the other half of the same
// behaviour and it is not the same kind of call: it is the single largest avoidable input cost
// in a session, and it has an exact escape that costs nothing — the same Read with offset/limit.
// So this one refuses, and the refusal names both ways forward.
//
// The measurement this leans on is the repository's own: evals/bench/pack-bench.mjs scores
// `harness pack` at 100% recall and a 90.3% token reduction over ten golden queries, 84–97% on
// files the size of the ones this gate fires on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT } from './_paths.mjs';
import { readRefusal, bashReadRefusal, READ_LINES } from '../.claude/harness/lib/guard.mjs';
import { renderClaudeHooks } from '../.claude/harness/lib/projection.mjs';

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const DISPATCH = read('.claude/harness/hooks/dispatch.mjs');

const workspace = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'read-gate-'));
  const write = (rel, lines) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, Array.from({ length: lines }, (_, i) => `line ${i}`).join('\n'));
    return rel;
  };
  const cfg = (guard = {}) => ({ layout: { root }, guard: { ...guard } });
  return { root, write, cfg, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

test('B1 a whole-file read above the threshold is refused, and the refusal names both escapes', () => {
  const s = workspace();
  try {
    const big = s.write('src/service.mjs', READ_LINES + 1);
    const hit = readRefusal(big, s.cfg());
    assert.ok(hit, `a ${READ_LINES + 1}-line whole-file read must not pass silently`);
    assert.equal(hit.rule, 'whole-file-read', 'a block names the rule that produced it');
    assert.match(hit.message, new RegExp(String(READ_LINES + 1)), 'the refusal says how big the file is');
    // The two ways forward. A refusal that names neither is the one agents route around.
    assert.match(hit.message, /harness pack/, 'the cheap lookup is named');
    assert.match(hit.message, /offset|limit/, 'the exact-text escape is named');
    // evidence.md F2's shape: never offer turning the gate off as the way forward.
    assert.doesNotMatch(hit.message, /read_lines\s*=\s*0|set \[guard\]/,
      'the refusal must not teach the agent to disable the gate');
  } finally { s.cleanup(); }
});

test('B2 a targeted read is never refused, at any size', () => {
  const s = workspace();
  try {
    const big = s.write('src/huge.mjs', READ_LINES * 10);
    assert.equal(readRefusal(big, s.cfg(), { offset: 1 }), null, 'offset is a targeted read');
    assert.equal(readRefusal(big, s.cfg(), { limit: 40 }), null, 'limit is a targeted read');
    assert.equal(readRefusal(big, s.cfg(), { offset: 200, limit: 40 }), null);
  } finally { s.cleanup(); }
});

test('B3 small, missing and rendered files pass', () => {
  const s = workspace();
  try {
    assert.equal(readRefusal(s.write('src/small.mjs', READ_LINES), s.cfg()), null,
      'at the threshold is not above it');
    assert.equal(readRefusal('src/nowhere.mjs', s.cfg()), null, 'let Read report its own ENOENT');
    assert.equal(readRefusal('', s.cfg()), null);
    // Read renders these rather than pasting lines; `wc -l` on them measures nothing.
    for (const rel of ['a.png', 'b.jpg', 'c.pdf', 'd.ipynb']) {
      assert.equal(readRefusal(s.write(rel, READ_LINES * 4), s.cfg()), null, rel);
    }
  } finally { s.cleanup(); }
});

test('B4 the change\'s own contract is read whole', () => {
  const s = workspace();
  try {
    // A spec or plan governs the write that follows it, and compliance is judged against its
    // exact text. The graph does not index it, so there is no pack to send the agent to.
    const plan = s.write('.claude/harness/artifacts/some-change/plan.md', READ_LINES * 2);
    assert.equal(readRefusal(plan, s.cfg()), null, 'the contract is not a lookup, it is the terms');
  } finally { s.cleanup(); }
});

test('B5 cat/head/tail on a large file is refused the same way; targeted shell reads are not', () => {
  const s = workspace();
  try {
    const big = s.write('src/service.mjs', READ_LINES + 1);
    const small = s.write('src/small.mjs', 10);
    const cfg = s.cfg();

    const hit = bashReadRefusal(`cat ${big}`, cfg);
    assert.ok(hit, 'cat is the way round the Read hook, and shunt found it first');
    assert.equal(hit.rule, 'whole-file-read', 'one rule name across both surfaces');
    assert.match(hit.message, /harness pack/);

    assert.ok(bashReadRefusal(`less "${big}"`, cfg), 'quoted path');
    assert.ok(bashReadRefusal(`cat ${small} ${big}`, cfg), 'the large file among several still counts');

    for (const cmd of [
      `cat ${big} | grep line`,      // a pipe is a targeted read
      `cat ${big} > /tmp/out`,       // a redirect never enters context
      `head -100 ${big}`,            // a line count is targeted, whatever shunt's own loop does
      `tail -n 50 ${big}`,
      `cat ${small}`,
      'git status',
      `rg line ${big}`,
      'cat',
    ]) assert.equal(bashReadRefusal(cmd, cfg), null, cmd);
  } finally { s.cleanup(); }
});

test('B6 the threshold is configurable and zero turns the gate off', () => {
  const s = workspace();
  try {
    const f = s.write('src/service.mjs', 120);
    assert.equal(readRefusal(f, s.cfg()), null, 'default threshold leaves a 120-line file alone');
    assert.ok(readRefusal(f, s.cfg({ read_lines: 100 })), 'a project may tighten it');
    assert.equal(readRefusal(f, s.cfg({ read_lines: 0 })), null, '0 is off');
    assert.equal(bashReadRefusal(`cat ${f}`, s.cfg({ read_lines: 0 })), null, 'off on both surfaces');
  } finally { s.cleanup(); }
});

test('B7 the gate is wired to Read without spending a binding', () => {
  const policy = JSON.parse(read('.claude/harness/hooks/policy.json'));
  const rendered = renderClaudeHooks(policy);
  const preTool = rendered.hooks.PreToolUse;
  assert.equal(preTool.length, 1, 'still one pre-tool binding — the ceiling is five for all events');
  assert.match(preTool[0].matcher, /\bRead\b/, 'the hook has to see Read to have an opinion about it');
  assert.equal(policy.bindings.length, 4, 'the gate adds no binding');

  // The committed projection is a generated view; a stale one means the shipped hook never fires.
  assert.deepEqual(JSON.parse(read('.claude/harness/hooks.json')).hooks, rendered.hooks,
    'run `harness init` — the Claude projection is behind .claude/harness/hooks/policy.json');

  assert.match(DISPATCH, /tool === 'Read'/);
  assert.match(DISPATCH, /return preRead/);
});
