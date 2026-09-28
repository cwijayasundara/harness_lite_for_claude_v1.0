// why: consumer sessions load these files. This repository's development history in them is
// tokens with no instruction in them, and paths that do not exist in a consumer's tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { A } from './_paths.mjs';

const HISTORY = [/\bG\d{2}\b/, /\bLaw \d+\b/, /\bItem \d+\b/, /docs\/history/, /\bMEASURED \d{4}/, /\blean-v2\b/, /evidence\.md F\d+/];

function shipped() {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|toml|yml)$/.test(e.name)) files.push(p);
    }
  };
  for (const dir of ['skills', 'roles', 'policies', 'templates']) walk(path.join(A, dir));
  return files;
}

test('shipped prompts and templates carry no development history', () => {
  const hits = [];
  for (const file of shipped()) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (HISTORY.some((re) => re.test(line))) hits.push(`${path.relative(A, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});
