import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateRunReceipt } from '../lib/model-policy.mjs';

const EVALUATION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schema', 'change_id', 'contract_digest', 'git_commit', 'evaluator_invocation_id', 'recommendation', 'findings'],
  properties: {
    schema: { const: 'aidlc.evaluation/v1' }, change_id: { type: 'string' }, contract_digest: { type: 'string' }, git_commit: { type: 'string' }, evaluator_invocation_id: { type: 'string' },
    recommendation: { enum: ['approve', 'changes-requested'] },
    findings: { type: 'array', maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['severity', 'behaviour_id', 'file', 'line', 'message', 'remedy'], properties: { severity: { enum: ['blocking', 'important', 'nit'] }, behaviour_id: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer', minimum: 1 }, message: { type: 'string' }, remedy: { type: 'string' } } } }
  }
};

function statusOf(result, timedOut, raw) {
  if (timedOut) return 'timeout';
  if (/max(?:imum)? budget|budget.*exceed/i.test(raw)) return 'budget-exceeded';
  if (/overloaded|unavailable|capacity|service outage/i.test(raw)) return 'outage';
  return result.status === 0 ? 'succeeded' : 'failed';
}

export function claudeCodeArgs(resolution, prompt, { readOnly = false, structured = false } = {}) {
  const args = ['-p', prompt, '--output-format', 'json', '--model', resolution.model, '--effort', resolution.effort, '--max-budget-usd', String(resolution.max_cost_usd), '--no-session-persistence'];
  if (readOnly) args.push('--permission-mode', 'plan', '--allowedTools', 'Read,Grep,Glob', '--disallowedTools', 'Write,Edit,NotebookEdit,Bash');
  else args.push('--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Grep,Glob,Edit,Write,Bash');
  if (structured) args.push('--json-schema', JSON.stringify(EVALUATION_SCHEMA));
  return args;
}

export function invokeClaudeCode({ resolution, prompt, cwd, readOnly = false, structured = false, run = spawnSync, env = process.env }) {
  const started = Date.now(); const args = claudeCodeArgs(resolution, prompt, { readOnly, structured });
  const result = run('claude', args, { cwd, env, encoding: 'utf8', timeout: resolution.timeout_ms, maxBuffer: 64 * 1024 * 1024 });
  const duration = Date.now() - started; const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  const raw = `${result.stdout ?? ''}${result.stderr ?? ''}`; let parsed = null;
  try { parsed = JSON.parse(result.stdout ?? ''); } catch { /* receipt records malformed output */ }
  const invocationId = parsed?.session_id ?? randomUUID();
  const receipt = { schema: 'aidlc.model-run/v1', role: resolution.role, provider: resolution.provider, model: resolution.model, policy_digest: resolution.policy_digest, invocation_id: invocationId, status: statusOf(result, timedOut, raw), duration_ms: Number(parsed?.duration_ms ?? duration), cost_usd: Number(parsed?.total_cost_usd ?? 0), exit_code: result.status ?? -1, output_digest: `sha256:${createHash('sha256').update(raw).digest('hex')}` };
  const issues = validateRunReceipt(receipt, resolution);
  if (issues.length) throw new Error(`invalid model run receipt: ${issues.join('; ')}`);
  let output = parsed?.structured_output ?? parsed?.result ?? null;
  if (structured && output && typeof output === 'object') output = { ...output, evaluator_invocation_id: invocationId };
  return { receipt, output, raw, args };
}

export function evaluationPrompt(handoffFile) {
  const handoff = JSON.parse(readFileSync(handoffFile, 'utf8'));
  return `Independently evaluate the committed change described by ${handoff.contract_file} at Git commit ${handoff.git_commit}. Validate contract digest ${handoff.contract_digest}. Do not modify files or run shell commands. Map every finding to a contract behaviour ID. Return only the required structured evaluation. Set evaluator_invocation_id to the current session ID supplied by the runtime.`;
}
