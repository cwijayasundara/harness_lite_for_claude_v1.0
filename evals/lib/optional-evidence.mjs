import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SCHEMA = 'harness.optional-module-evidence/v1';
export const IDS = ['evaluator-review', 'graph-map-pack', 'autonomous-driver',
  'worktree-coordination', 'continuous-live-evals'];

export function validateOptionalEvidence(root, record) {
  const errors = [];
  if (record?.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  if (!Array.isArray(record?.modules)) return [...errors, 'modules must be an array'];
  const ids = record.modules.map((module) => module.id);
  if (new Set(ids).size !== ids.length) errors.push('module ids must be unique');
  for (const id of IDS) if (!ids.includes(id)) errors.push(`missing module: ${id}`);
  for (const module of record.modules) {
    for (const field of ['control', 'treatment', 'evidence', 'evidence_kind', 'observed', 'limitation', 'decision']) {
      if (typeof module[field] !== 'string' || !module[field].trim()) errors.push(`${module.id}.${field} must be non-empty text`);
    }
    if (module.control === module.treatment) errors.push(`${module.id} does not isolate one treatment`);
    if (!['optional', 'do-not-ship-continuously'].includes(module.decision)) errors.push(`${module.id} has unsupported decision ${module.decision}`);
    if (typeof module.evidence === 'string' && !existsSync(path.join(root, module.evidence))) errors.push(`${module.id} evidence does not exist: ${module.evidence}`);
  }
  return errors;
}

export function verifyObservedEvidence(root, record) {
  const errors = validateOptionalEvidence(root, record);
  if (errors.length) return errors;

  const smoke = JSON.parse(readFileSync(path.join(root, 'evals/evidence/smoke/agent-mechanisms.json')));
  if (!smoke.pass || !smoke.phases?.some((phase) => /evaluator found seeded defect/.test(phase))) errors.push('evaluator smoke does not contain the claimed seeded-defect result');

  const comparisons = JSON.parse(readFileSync(path.join(root, 'evals/evidence/comparison-summary.json')));
  const completeGraph = comparisons.runs?.map((run) => run.summary).find((summary) =>
    summary?.['graph/without-graph/paired']?.acceptedChanges === 33
    && summary?.['graph/with-graph/paired']?.acceptedChanges === 33);
  if (!completeGraph) errors.push('completed 33-change graph pair is absent');
  else if (!(completeGraph['graph/with-graph/paired'].costPerAcceptedChange
      > completeGraph['graph/without-graph/paired'].costPerAcceptedChange)) errors.push('graph cost claim is not supported');

  const driver = JSON.parse(readFileSync(path.join(root, 'evals/evidence/g24-driver-comparison.json')));
  if (driver.verdict?.pass !== false || driver.verdict?.acceptance?.native !== 0
    || driver.verdict?.acceptance?.harness !== 0) errors.push('driver calibration no longer supports the recorded inconclusive decision');

  const teamTest = readFileSync(path.join(root, 'test/two-engineer-campaign.test.mjs'), 'utf8');
  if (!/two engineers evolve a shared product/.test(teamTest) || !/worktree/.test(teamTest)) errors.push('worktree integration proof is absent');

  const workflow = readFileSync(path.join(root, '.github/workflows/harness.yml'), 'utf8');
  if (!/workflow_dispatch:/.test(workflow) || !/schedule:/.test(workflow)
    || !/github\.event_name == 'workflow_dispatch' && inputs\.model_smoke/.test(workflow)) errors.push('bounded scheduled/manual eval policy is absent');
  return errors;
}

export function readOptionalEvidence(root) {
  return JSON.parse(readFileSync(path.join(root, 'evals/evidence/optional-modules.json')));
}
