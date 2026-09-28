// Changed lines between two revisions, split into source and tests, so the comparison can ask
// whether the harness produces less code for the same accepted behaviour.
import { execFileSync } from 'node:child_process';
import { TEST_FILE } from '../../.claude/harness/lib/diff.mjs';

export function changedLines(root, from, to, files) {
  const out = execFileSync('git', ['diff', '--numstat', '-z', '--no-renames', from, to, '--', ...files],
    { cwd: root, encoding: 'utf8' });
  const lines = { source: 0, test: 0 };
  for (const row of out.split('\0').filter(Boolean)) {
    const [added, deleted, file] = row.split('\t');
    if (added === '-') continue;
    lines[TEST_FILE.test(file) ? 'test' : 'source'] += Number(added) + Number(deleted);
  }
  return lines;
}
