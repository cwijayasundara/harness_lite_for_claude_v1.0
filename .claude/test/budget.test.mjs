// Law 5, as a red test. You cannot argue with it; you must delete something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from '../checks/budget.mjs';

const C = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIMITS = { skills: 12, agents: 3, hooks: 5, hook_loc: 600, claude_md_lines: 120 };

test('the harness stays inside its own budget', () => {
  const m = measure({ layout: { claude: C, claudeMd: path.join(C, 'CLAUDE.md') } });
  for (const [k, max] of Object.entries(LIMITS)) {
    assert.ok(m[k] <= max, `${k} = ${m[k]}, limit ${max}. Delete one before adding another.`);
  }
});
