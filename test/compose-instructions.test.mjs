// why: `harness init` adopted a CLAUDE.md the harness had itself generated as the project's own
// conventions, so every re-install nested a full copy of the harness instructions under
// `## Project conventions` — examples/scratch-py grew from 558 to 1,698 tokens that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeProjectInstructions, renderClaudeInstructions } from '../.claude/harness/lib/projection.mjs';

const TEMPLATE = '# CHANGE-ME\n\n## AIDLC workflow\n\nRun status.\n\n## Project conventions\n\nReplace this.\n';

test('a hand-written CLAUDE.md is adopted under Project conventions with its title', () => {
  const out = composeProjectInstructions(TEMPLATE, '# shortlink\n\nUse pytest. Money is integer cents.\n');
  assert.match(out, /^# shortlink$/m);
  assert.match(out, /## Project conventions\n\nUse pytest\. Money is integer cents\.\n$/);
});

test('a CLAUDE.md the harness generated contributes only its own Project conventions, never a second copy', () => {
  const earlier = renderClaudeInstructions(composeProjectInstructions(TEMPLATE, '# shortlink\n\nUse pytest.\n'));
  const out = composeProjectInstructions(TEMPLATE, earlier);
  assert.equal(out.match(/^## AIDLC workflow$/gm).length, 1, 'the harness instructions appear once');
  assert.equal(out.match(/^## Project conventions$/gm).length, 1);
  assert.doesNotMatch(out, /Generated from/);
  assert.match(out, /^# shortlink$/m);
  assert.match(out, /## Project conventions\n\nUse pytest\.\n$/);
});

test('a generated CLAUDE.md with no conventions of its own adopts nothing', () => {
  const earlier = renderClaudeInstructions(TEMPLATE.replace('# CHANGE-ME', '# shortlink').replace('Replace this.\n', ''));
  const out = composeProjectInstructions(TEMPLATE, earlier);
  assert.equal(out.match(/^## AIDLC workflow$/gm).length, 1);
  assert.match(out, /^# shortlink$/m);
});
