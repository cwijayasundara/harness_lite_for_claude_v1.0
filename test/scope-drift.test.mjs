import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { run } from '../.aidlc/checks/scope-drift.mjs';
import { sealContract } from '../.aidlc/lib/contract.mjs';
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

// scope-drift-reads-every-contract B1/B2/B4/B6. Ownership is a property of the repository, not
// of whichever contract was edited last. Reading it off the single most-recently-modified
// contract made the check disagree with the write guard: recording `evals/expected.json`, owned
// by `eval-ratchet`, failed because `recalibrate-eval-budgets` had a newer mtime.
test('a file owned by any approved committed contract is in scope, whichever is newest', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const dir = path.join(s.work, '.aidlc/artifacts/contracts');
    const refs = path.join(s.work, '.aidlc/artifacts/intent-refs');
    // A second, newer contract that owns a different file.
    const first = readFileSync(path.join(dir, 'hyphen-titlecase.md'), 'utf8');
    // Re-seal rather than hand-edit: changing a body invalidates its approval digests, which is
    // the seal doing its job.
    const forge = (slug, owns) => {
      writeFileSync(path.join(refs, `${slug}.json`), readFileSync(path.join(refs, 'hyphen-titlecase.json'), 'utf8').replace(/hyphen-titlecase/g, slug));
      const file = path.join(dir, `${slug}.md`);
      writeFileSync(file, first
        .replace(/hyphen-titlecase/g, slug)
        .replace('- `src/app/text.py`\n- `tests/test_app.py`', `- \`${owns}\``)
        .replace(/^- \*\*Spec status:\*\*.*$/m, '- **Spec status:** draft')
        .replace(/^- \*\*Spec approval digest:\*\*.*$/m, '- **Spec approval digest:** pending')
        .replace(/^- \*\*Plan status:\*\*.*$/m, '- **Plan status:** draft')
        .replace(/^- \*\*Plan approval digest:\*\*.*$/m, '- **Plan approval digest:** pending'));
      sealContract(file, 'spec');
      sealContract(file, 'plan');
      return file;
    };
    forge('other', 'src/app/handlers.py');
    const git = (...a) => spawnSync('git', a, { cwd: s.work, encoding: 'utf8' });
    git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'second contract');

    // B4: an approved contract that is not committed owns nothing.
    forge('uncommitted', 'src/app/never.py');

    // B1: text.py belongs to the older contract; handlers.py to the newer. Both are in scope.
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# owned by hyphen-titlecase\n');
    writeFileSync(path.join(s.work, 'src/app/handlers.py'), '# owned by other\n');
    assert.equal((await run(cfg(s.work))).verdict, 'pass', 'both contracts own their own file');

    // B2: widening ownership must not stop the check catching a file nobody owns.
    writeFileSync(path.join(s.work, 'src/app/never.py'), '# owned only by an uncommitted contract\n');
    const result = await run(cfg(s.work));
    assert.equal(result.verdict, 'fail');
    assert.match(result.findings.map((f) => f.file).join(' '), /never\.py/);
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
