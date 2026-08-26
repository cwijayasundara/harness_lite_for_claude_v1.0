import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { behaviourIds, contractDigest, isCommitted, validateContract } from './contract.mjs';

const ROLES = ['specify', 'generate', 'evaluate', 'diagnose'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PINNED = /^(?!sonnet$|opus$|latest$)[a-z0-9][a-z0-9._:@/-]*$/;
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;

function atomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try { writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); renameSync(tmp, file); }
  catch (error) { rmSync(tmp, { force: true }); throw error; }
}

function modelIssues(value, at) {
  const issues = [];
  if (!plain(value)) return [`${at} must be a model object`];
  if (typeof value.provider !== 'string' || !value.provider) issues.push(`${at}.provider is required`);
  if (typeof value.model !== 'string' || !PINNED.test(value.model)) issues.push(`${at}.model must be a pinned model ID, not a floating alias`);
  if (!EFFORTS.includes(value.effort)) issues.push(`${at}.effort must be ${EFFORTS.join(', ')}`);
  for (const key of Object.keys(value)) if (!['provider', 'model', 'effort'].includes(key)) issues.push(`${at}: unsupported field ${key}`);
  return issues;
}

export function policyDigest(policy) { return hash(JSON.stringify(canonical(policy))); }

export function validateModelPolicy(policy) {
  const issues = [];
  if (policy?.schema !== 'aidlc.model-policy/v1') issues.push('model policy schema must be aidlc.model-policy/v1');
  if (typeof policy?.revision !== 'string' || !policy.revision) issues.push('model policy revision is required');
  for (const role of ROLES) if (typeof policy?.roles?.[role] !== 'string') issues.push(`model policy role ${role} is required`);
  for (const [name, value] of Object.entries(policy?.policies ?? {})) {
    issues.push(...modelIssues(value?.primary, `policy ${name}.primary`));
    if (value?.fallback !== null) issues.push(...modelIssues(value?.fallback, `policy ${name}.fallback`));
    if (!Number.isInteger(value?.timeout_ms) || value.timeout_ms < 1) issues.push(`policy ${name}.timeout_ms must be positive`);
    if (!(value?.max_cost_usd > 0)) issues.push(`policy ${name}.max_cost_usd must be positive`);
  }
  for (const role of ROLES) if (policy?.roles?.[role] && !policy?.policies?.[policy.roles[role]]) issues.push(`role ${role} references unknown policy ${policy.roles[role]}`);
  if (!Number.isInteger(policy?.max_repair_loops) || policy.max_repair_loops < 0 || policy.max_repair_loops > 10) issues.push('max_repair_loops must be an integer from 0 to 10');
  return [...new Set(issues)];
}

export function loadModelPolicy(root) {
  const file = path.join(root, '.aidlc', 'model-policy.json');
  if (!existsSync(file)) throw new Error(`model policy not found: ${file}`);
  const policy = JSON.parse(readFileSync(file, 'utf8')); const issues = validateModelPolicy(policy);
  if (issues.length) throw new Error(issues.join('; '));
  return { file, policy };
}

export function resolveModel(policy, role, { unavailable = [] } = {}) {
  const issues = validateModelPolicy(policy); if (issues.length) throw new Error(issues.join('; '));
  if (!ROLES.includes(role)) throw new Error(`unknown model role ${role}`);
  const policyName = policy.roles[role]; const selected = policy.policies[policyName];
  const key = (model) => `${model.provider}/${model.model}`;
  let model = selected.primary; let resolution = 'primary';
  if (unavailable.includes(key(model))) {
    if (!selected.fallback || unavailable.includes(key(selected.fallback))) throw new Error(`no available model for role ${role}; fallback is not configured or is unavailable`);
    model = selected.fallback; resolution = 'fallback';
  }
  return { schema: 'aidlc.model-resolution/v1', role, policy: policyName, policy_revision: policy.revision, policy_digest: policyDigest(policy), provider: model.provider, model: model.model, effort: model.effort, resolution, timeout_ms: selected.timeout_ms, max_cost_usd: selected.max_cost_usd };
}

export function validateRunReceipt(value, resolution) {
  const issues = [];
  if (value?.schema !== 'aidlc.model-run/v1') issues.push('run schema must be aidlc.model-run/v1');
  if (value?.role !== resolution.role || value?.provider !== resolution.provider || value?.model !== resolution.model) issues.push('run role/provider/model does not match resolution');
  if (value?.policy_digest !== resolution.policy_digest) issues.push('run policy digest does not match resolution');
  if (typeof value?.invocation_id !== 'string' || !value.invocation_id) issues.push('run invocation_id is required');
  if (!['succeeded', 'outage', 'timeout', 'budget-exceeded', 'failed'].includes(value?.status)) issues.push('run status is invalid');
  if (!(value?.duration_ms >= 0)) issues.push('run duration_ms must be non-negative');
  if (!(value?.cost_usd >= 0)) issues.push('run cost_usd must be non-negative');
  if (!Number.isInteger(value?.exit_code)) issues.push('run exit_code must be an integer');
  if (!DIGEST.test(value?.output_digest ?? '')) issues.push('run output_digest must be sha256:<64 hex>');
  if (value?.status === 'succeeded' && value?.exit_code !== 0) issues.push('successful run must have exit code 0');
  if (value?.duration_ms > resolution.timeout_ms && value?.status !== 'timeout') issues.push('run exceeded timeout without timeout status');
  if (value?.cost_usd > resolution.max_cost_usd && value?.status !== 'budget-exceeded') issues.push('run exceeded cost ceiling without budget-exceeded status');
  return issues;
}

export function createHandoff(root, contractFile, policy, { from, to, sourceInvocationId, attempt = 1 }) {
  if (!ROLES.includes(from) || !ROLES.includes(to) || from === to) throw new Error('handoff requires two distinct known roles');
  if (typeof sourceInvocationId !== 'string' || !sourceInvocationId) throw new Error('handoff source invocation id is required');
  const validation = validateContract(root, contractFile);
  if (!validation.ok || validation.meta.plan_status !== 'approved' || !isCommitted(root, contractFile)) throw new Error('handoff requires a valid committed fully approved contract');
  let commit; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { throw new Error('handoff requires committed Git state'); }
  if (!/^[a-f0-9]{7,64}$/.test(commit)) throw new Error('handoff Git commit is invalid');
  const target = resolveModel(policy, to);
  return { schema: 'aidlc.handoff/v1', change_id: validation.meta.change_id, contract_file: path.relative(root, contractFile), contract_digest: contractDigest(readFileSync(contractFile, 'utf8'), 'plan'), git_commit: commit, from_role: from, to_role: to, source_invocation_id: sourceInvocationId, target, attempt, max_attempts: policy.max_repair_loops + 1, created_at: new Date().toISOString() };
}

export function writeHandoff(file, value) { if (existsSync(file)) throw new Error(`refusing to overwrite ${file}`); atomic(file, value); return file; }
export function writeRunReceipt(file, value) { if (existsSync(file)) throw new Error(`refusing to overwrite ${file}`); atomic(file, value); return file; }

export function validateEvaluation(value, handoff, contractBody) {
  const issues = [];
  if (value?.schema !== 'aidlc.evaluation/v1') issues.push('evaluation schema must be aidlc.evaluation/v1');
  if (value?.change_id !== handoff.change_id || value?.contract_digest !== handoff.contract_digest || value?.git_commit !== handoff.git_commit) issues.push('evaluation does not match handoff state');
  if (value?.evaluator_invocation_id === handoff.source_invocation_id) issues.push('generator cannot evaluate or approve its own work');
  if (typeof value?.evaluator_invocation_id !== 'string' || !value.evaluator_invocation_id) issues.push('evaluator invocation id is required');
  if (!['approve', 'changes-requested'].includes(value?.recommendation)) issues.push('evaluation recommendation is invalid');
  if (!Array.isArray(value?.findings) || value.findings.length > 50) issues.push('evaluation findings must be an array of at most 50');
  const behaviours = new Set(behaviourIds(contractBody));
  for (const [index, finding] of (value?.findings ?? []).entries()) {
    if (!plain(finding)) { issues.push(`finding ${index} must be an object`); continue; }
    if (!['blocking', 'important', 'nit'].includes(finding.severity)) issues.push(`finding ${index} severity is invalid`);
    if (!behaviours.has(finding.behaviour_id)) issues.push(`finding ${index} behaviour_id is unknown`);
    if (typeof finding.file !== 'string' || path.isAbsolute(finding.file) || finding.file.split(/[\\/]/).includes('..')) issues.push(`finding ${index} file is unsafe`);
    if (!Number.isInteger(finding.line) || finding.line < 1) issues.push(`finding ${index} line must be positive`);
    if (typeof finding.message !== 'string' || !finding.message.trim() || typeof finding.remedy !== 'string' || !finding.remedy.trim()) issues.push(`finding ${index} message and remedy are required`);
  }
  if (value?.recommendation === 'approve' && (value?.findings ?? []).some((finding) => finding.severity !== 'nit')) issues.push('approve cannot contain blocking or important findings');
  return issues;
}

export function evaluationDecision(value, handoff, policy) {
  if (value.recommendation === 'approve') return { status: 'approved', next_role: null, terminal: true };
  if (handoff.attempt >= policy.max_repair_loops + 1) return { status: 'exhausted', next_role: null, terminal: true };
  return { status: 'repair', next_role: 'generate', terminal: false, next_attempt: handoff.attempt + 1 };
}

export function ingestEvaluation(file, value, handoff, contractBody, policy) {
  const issues = validateEvaluation(value, handoff, contractBody); if (issues.length) throw new Error(issues.join('; '));
  const receipt = { ...value, handoff_digest: hash(JSON.stringify(canonical(handoff))), decision: evaluationDecision(value, handoff, policy), ingested_at: new Date().toISOString() };
  if (existsSync(file)) throw new Error(`refusing to overwrite ${file}`); atomic(file, receipt); return receipt;
}
