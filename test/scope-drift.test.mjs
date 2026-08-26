import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run } from '../.aidlc/checks/scope-drift.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';

const cfg = (root) => ({ layout: {
  root,
  plan: path.join(root, '.aidlc/artifacts/plan'), // read-only migration compatibility
  contracts: path.join(root, '.aidlc/artifacts/contracts'),
} });

test('the approved delivery contract owns the working diff', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# in contract\n');
    assert.equal((await run(cfg(s.work))).verdict, 'pass');
    writeFileSync(path.join(s.work, 'src/app/handlers.py'), '# outside contract\n');
    const result = await run(cfg(s.work));
    assert.equal(result.verdict, 'fail');
    assert.match(result.findings.map((finding) => finding.file).join(' '), /handlers\.py/);
    assert.equal(result.findings[0].rule, 'scope-drift');
    assert.match(result.findings[0].message, /contracts\/hyphen-titlecase\.md/);
  } finally { s.cleanup(); }
});

test('an invalidated contract cannot authorize product changes', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const contract = path.join(s.work, '.aidlc/artifacts/contracts/hyphen-titlecase.md');
    writeFileSync(contract, `${readFileSync(contract, 'utf8')}\nchanged after approval\n`);
    const result = await run(cfg(s.work));
    assert.equal(result.verdict, 'fail');
    assert.equal(result.findings[0].rule, 'contract-invalid');
  } finally { s.cleanup(); }
});
