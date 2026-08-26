// This repository's project-owned test-integrity policy. Product repositories replace this
// command with mutation testing or their framework's equivalent; it is not kernel logic.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = readdirSync(path.join(root, 'test')).filter((file) => file.endsWith('.test.mjs'));
let tests = 0;
for (const file of files) tests += (readFileSync(path.join(root, 'test', file), 'utf8').match(/\btest\s*\(/g) ?? []).length;
if (files.length === 0 || tests === 0) {
  console.error('test-quality: no executable *.test.mjs tests found');
  process.exit(1);
}
