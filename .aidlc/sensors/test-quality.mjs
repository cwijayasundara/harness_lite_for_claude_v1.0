// Legacy test_quality capability: presence heuristic only. Counts test(...) text, including
// comments; cannot prove execution, assertions, coverage, or resistance to mutations.
// Product repositories can configure an actual mutation/assertion-quality command.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = readdirSync(path.join(root, 'test')).filter((file) => file.endsWith('.test.mjs'));
let tests = 0;
for (const file of files) tests += (readFileSync(path.join(root, 'test', file), 'utf8').match(/\btest\s*\(/g) ?? []).length;
if (files.length === 0 || tests === 0) {
  console.error('test-presence: no *.test.mjs files containing test(...) found');
  process.exit(1);
}
