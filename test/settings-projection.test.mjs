// The deny half of the Claude permission projection.
//
// why: MEASURED 2026-09-18. `.gitignore` has carried "Never a key in the tree" since the commit
// stage's secret scanner landed, and both lines of that defence are about the *tree*: the file is
// untrackable, and a tracked file carrying `sk-ant-` fails `secrets`. Neither is about the agent.
// Nothing stopped a session reading `.env` and putting the key in its own transcript, and this
// repository exports transcripts as evidence under `evals/evidence/` and `.aidlc/evals/`. A
// scanner reading the tree cannot see that, because the key never entered the tree.
//
// Denied rather than guarded: a hook refusal is a round trip that spends a turn and can be
// disabled, and `permissions.deny` is the mechanism the host already has for exactly this shape
// of rule — unconditional, path-shaped, evaluated before the tool call. `protected_paths` stays
// in the hook where it belongs, because it is NOT unconditional: guard.mjs lets a committed
// approved contract naming that exact path through, and a deny rule cannot read a contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SECRET_PATHS, renderClaudePermissions } from '../.aidlc/lib/projection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW = ['Edit(.aidlc/artifacts/**)'];

test('every secret path is denied to all three file tools', () => {
  const { deny } = renderClaudePermissions(ALLOW, '');
  for (const p of SECRET_PATHS) {
    for (const tool of ['Read', 'Edit', 'Write']) assert.ok(deny.includes(`${tool}(${p})`), `${tool}(${p})`);
  }
});

test('the allow list passes through untouched', () => {
  assert.deepEqual(renderClaudePermissions(ALLOW, '').allow, ALLOW);
});

// A `!` line removes a pattern it names exactly — the opt-out for a project that genuinely keeps
// no secret in `.env`, without editing the harness.
test('a ! line naming a secret pattern exactly removes it', () => {
  const { deny } = renderClaudePermissions(ALLOW, '!.env\n');
  assert.ok(!deny.includes('Read(.env)'), '.env was re-included by the project');
  assert.ok(deny.includes('Read(.env.*)'), 'the rest of the family is untouched');
});

// The case that settles the negation question. Sparing `.env.example` means dropping `.env.*`,
// which is also `.env.production`. The example stays denied on purpose: this asserts the trade,
// so a later change that "fixes" it has to argue with a named test rather than a silent one.
test('a ! line does not punch a hole in a wider pattern', () => {
  const { deny } = renderClaudePermissions(ALLOW, '.env\n.env.*\n!.env.example\n');
  assert.ok(deny.includes('Read(.env.*)'), 'sparing the example would unblock .env.production');
});

test('negations that name nothing in the secret list are ignored', () => {
  const plain = renderClaudePermissions(ALLOW, '');
  assert.deepEqual(renderClaudePermissions(ALLOW, '!dist/\n!node_modules/\n'), plain);
});

// Law 3: the shipped file is the projection, or the two can disagree. Same shape as the hooks
// assertion in contracts.test.mjs, which compares adapters/claude/hooks.json to its renderer.
test('this repository ships the current projection', () => {
  const settings = JSON.parse(readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  const ignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.deepEqual(settings.permissions, renderClaudePermissions(settings.permissions.allow, ignore));
});
