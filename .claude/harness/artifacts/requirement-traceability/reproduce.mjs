// Run from repository root. Only disposable product copies are mutated.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { stage, FIXTURES } from '../../../evals/lib/stage.mjs';
import { loadConfig } from '../../lib/config.mjs';
import * as artifacts from '../../lib/artifacts.mjs';
import { check } from '../../lib/runner.mjs';

const s = stage(FIXTURES, 'contract-planned');
const git = (...args) => execFileSync('git', args, { cwd: s.work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  const cfg = loadConfig(s.work);
  const slug = 'hyphen-titlecase';
  const base = git('rev-parse', 'HEAD');
  const before = artifacts.read(cfg, slug, 'spec').state;
  const specPath = artifacts.file(cfg, slug, 'spec');
  const spec = artifacts.parse(readFileSync(specPath, 'utf8'));
  writeFileSync(specPath, artifacts.render({ ...spec.front, supersedes: 'missing-change#B99' }, spec.body));
  const relationshipEdit = artifacts.read(cfg, slug, 'spec').state;
  const intentPath = artifacts.file(cfg, slug, 'intent');
  writeFileSync(intentPath, readFileSync(intentPath, 'utf8') + '\nRequirement correction: preserve hyphens without capitalizing the second part.\n');
  const intentEdit = artifacts.read(cfg, slug, 'spec').state;
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Simulated product requirement correction');
  const candidate = git('rev-parse', 'HEAD');
  const report = await check({ ...cfg, stages: { reproduction: ['scope-drift'] } }, {
    stage: 'reproduction', base, candidate, change: slug, write: false,
  });
  const result = {
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    fixture: 'contract-planned', simulated_fixture_approvals: true,
    before, after_relationship_edit: relationshipEdit, after_intent_edit: intentEdit,
    expected: 'Both edits must be visible as unbound or stale inputs, never current traceable approval.',
    candidate_report: report,
    executed_proof: 'No test control was requested or executed; existing report contains no per-behaviour execution status.',
  };
  writeFileSync(path.join('.aidlc/artifacts/requirement-traceability', 'reproduction.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { s.cleanup(); }
