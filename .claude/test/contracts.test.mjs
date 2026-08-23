// The static half of the writer/grader separation. v6 proved that the runtime half alone is
// not enough: a contract nobody validates drifts away from the frontmatter it describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const C = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function frontmatter(file) {
  const m = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, `${file} has no frontmatter`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

test('every agent has a contract, and its tools match its frontmatter', () => {
  const dir = path.join(C, 'agents');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const name = f.replace(/\.md$/, '');
    const contractPath = path.join(dir, `${name}.contract.json`);
    assert.ok(existsSync(contractPath), `${name} has no contract`);
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    const fm = frontmatter(path.join(dir, f));
    const declared = (fm.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    assert.deepEqual(declared, contract.tools, `${name}: frontmatter tools drifted from the contract`);
    assert.ok(contract.why, `${name}: a contract without a why: is not a control (Law 10)`);
    if (contract.may_write === false) {
      assert.ok(!declared.includes('Write') && !declared.includes('Edit'),
        `${name} declares may_write:false but is granted a write tool`);
    }
  }
});

test('every skill has a name and a pushy third-person description', () => {
  const dir = path.join(C, 'skills');
  for (const s of readdirSync(dir)) {
    const fm = frontmatter(path.join(dir, s, 'SKILL.md'));
    assert.equal(fm.name, s, `${s}: frontmatter name must equal the directory name`);
    assert.ok(fm.description.length > 80, `${s}: description too thin to trigger reliably`);
    assert.ok(fm.description.length <= 1024, `${s}: description over the 1024-char limit`);
    assert.match(fm.description, /should be used|Use when|used when/i,
      `${s}: description must say WHEN to use it — that is what makes it fire`);
  }
});

test('skills stay short: 130 lines hard stop', () => {
  const dir = path.join(C, 'skills');
  for (const s of readdirSync(dir)) {
    const n = readFileSync(path.join(dir, s, 'SKILL.md'), 'utf8').split('\n').length;
    assert.ok(n <= 130, `${s}/SKILL.md is ${n} lines. Split it into references/ or cut it.`);
  }
});

test('no skill sequences phases (Law 2)', () => {
  // A numbered list longer than eight steps inside a skill is a program written in English.
  const dir = path.join(C, 'skills');
  for (const s of readdirSync(dir)) {
    const text = readFileSync(path.join(dir, s, 'SKILL.md'), 'utf8');
    const longest = Math.max(0, ...text.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => /^\s*\d+\.\s/.test(l)).length));
    assert.ok(longest <= 8, `${s}: a ${longest}-step numbered sequence belongs in bin/harness, not a skill`);
  }
});
