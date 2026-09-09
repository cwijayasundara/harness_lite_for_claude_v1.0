// skills-earn-their-context: a skill is shipped because it says something specific to this
// harness, or because evidence says it earns its context. This file states that ceiling; the
// per-skill reasoning is in .aidlc/artifacts/skills-earn-their-context/review.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { A, ROOT } from './_paths.mjs';

const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const skill = name => read(`.aidlc/skills/${name}/SKILL.md`);
const lines = text => text.trimEnd().split('\n').length;
const README = read('README.md');
const PLAN = read('docs/IMPROVEMENT-PLAN.md');
const HARNESS = read('.aidlc/bin/harness');

// The reviewed set, by name rather than by count, so a swap fails as loudly as an addition.
const SHIPPED = ['change-safely', 'diagnose', 'implement', 'intent', 'map', 'plan', 'spec'];

test('B1 the shipped skills are the reviewed seven, and the ceiling has not moved', () => {
  const dirs = readdirSync(path.join(A, 'skills'), { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort();
  assert.deepEqual(dirs, SHIPPED,
    'a skill was added, removed or renamed: record why in review.md and Law 11 evidence for it');

  // Adding one means deleting one. Raising the ceiling instead is the move this row refuses.
  const toml = read('.aidlc/harness.toml');
  const limits = Object.fromEntries(
    [...toml.matchAll(/^(skills|agents|hooks)\s*=\s*(\d+)/gm)].map(m => [m[1], Number(m[2])]));
  assert.deepEqual(limits, { skills: 7, agents: 3, hooks: 5 },
    'the registry ceiling moved; the budget is spent, not a starting position');
});

test('B2 the two generic skills are shorter, and every specific rule in them survives', () => {
  // Baselines are the line counts at 89b5c20, before this change trimmed them.
  const diagnose = skill('diagnose');
  const changeSafely = skill('change-safely');
  assert.ok(lines(diagnose) < 53, `diagnose grew back: ${lines(diagnose)} lines`);
  assert.ok(lines(changeSafely) < 42, `change-safely grew back: ${lines(changeSafely)} lines`);

  // Generic prose that names nothing here and that no record motivates. `## Anti-patterns`
  // arrived at 303b58b, before any lean-era spec.
  assert.doesNotMatch(diagnose, /## Anti-patterns/);
  assert.doesNotMatch(changeSafely, /\| Situation \| Approach \|/);

  // What must not be lost with it: the harness-specific core of each file.
  for (const rule of [
    /bash \.aidlc\/bin\/harness check/,          // the loop is built from this repository's checks
    /harness new incident <slug>/,               // control-band breach -> incident -> linked intent
    /one permanent eval reproducing the incident class/,
    /test locks and external evaluation fixtures remain protected/,
  ]) assert.match(diagnose, rule, 'a harness-specific rule was cut from diagnose');

  for (const rule of [
    /harness graph query. \/ .harness pack. before whole-file reads/,
    /approved file scope, test\s+locks and external evaluation ownership/,
    /supersedes link/,
    /extends where applicable/,
    /revision-specific product context when recorded\s+delivery evidence exists/,
    /Fix implementation bugs to meet the approved requirement/,
  ]) assert.match(changeSafely, rule, 'a harness-specific rule was cut from change-safely');
});

test('B3 every skill and agent the README presents as shipped exists', () => {
  const claimed = README.split('\n')
    .filter(line => line.includes('pulls in'))
    .flatMap(line => [...line.matchAll(/`([a-z][a-z-]+)`/g)].map(m => m[1]));
  assert.ok(claimed.length >= 3, 'the README no longer names the skills it ships');
  for (const name of claimed) {
    const isSkill = existsSync(path.join(A, 'skills', name, 'SKILL.md'));
    const isRole = existsSync(path.join(A, 'roles', `${name}.md`));
    assert.ok(isSkill || isRole, `README names "${name}", which is neither a skill nor a role`);
  }
  // Replaced by change-safely at 3332615. BUILD-PLAN's account of the original twenty is history.
  assert.doesNotMatch(README, /pure-refactor/);
  assert.doesNotMatch(read('.aidlc/instructions.md'), /pure-refactor/);
});

test('B4 the guidance states the entry condition, and there is no way to ship a skill pack', () => {
  assert.match(README, /failing eval or a defect recorded while building a real application/,
    'the README must state what admits a skill');
  assert.match(README, /A capable agent being able to follow a generic recipe is not that evidence\./);
  assert.match(README, /no pack, bundle, overlay or\s+per-domain marketplace/);

  assert.match(PLAN, /Skills and roles \| Reviewed per skill/,
    'the lean-review row must record the decision, not restate the question');
  assert.match(PLAN, /skills-earn-their-context/, 'the row must name where the per-skill review lives');

  // The whole verb surface. A `harness skills`, `bundle` or `overlay` verb fails here first.
  const verbs = [...HARNESS.matchAll(/^ {4}case '([a-z-]+)':/gm)].map(m => m[1]).sort();
  assert.deepEqual(verbs, [
    'approve', 'baseline', 'check', 'doctor', 'evals', 'graph', 'hook', 'init',
    'ledger', 'map', 'new', 'pack', 'review', 'status',
  ], 'a new top-level verb needs its own approved contract');
});
