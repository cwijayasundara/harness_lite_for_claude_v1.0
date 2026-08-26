import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN, ROOT } from './_paths.mjs';
import { createHandoff, evaluationDecision, resolveModel, validateEvaluation, validateModelPolicy, validateRunReceipt } from '../.aidlc/lib/model-policy.mjs';
import { claudeCodeArgs, invokeClaudeCode } from '../.aidlc/providers/claude-code.mjs';

const policy = () => JSON.parse(readFileSync(path.join(ROOT, '.aidlc/model-policy.json'), 'utf8'));
const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

test('four neutral roles resolve generation to Sonnet 5 and evaluation to Opus 5', () => {
  const value = policy(); assert.deepEqual(validateModelPolicy(value), []);
  assert.equal(resolveModel(value, 'specify').model, 'claude-sonnet-5');
  assert.equal(resolveModel(value, 'generate').model, 'claude-sonnet-5');
  assert.equal(resolveModel(value, 'evaluate').model, 'claude-opus-5');
  assert.equal(resolveModel(value, 'diagnose').model, 'claude-opus-5');
  const floating = policy(); floating.policies.generation.primary.model = 'sonnet';
  assert.match(validateModelPolicy(floating).join('\n'), /pinned model ID/);
});

test('outage fallback is explicit and an unavailable no-fallback policy fails closed', () => {
  const value = policy();
  assert.throws(() => resolveModel(value, 'generate', { unavailable: ['anthropic/claude-sonnet-5'] }), /fallback is not configured/);
  value.policies.generation.fallback = { provider: 'anthropic', model: 'claude-sonnet-4-6', effort: 'high' };
  const resolution = resolveModel(value, 'generate', { unavailable: ['anthropic/claude-sonnet-5'] });
  assert.equal(resolution.resolution, 'fallback'); assert.equal(resolution.model, 'claude-sonnet-4-6');
});

test('run receipts cannot hide timeout or cost ceiling breaches', () => {
  const resolution = resolveModel(policy(), 'generate');
  const base = { schema: 'aidlc.model-run/v1', role: 'generate', provider: resolution.provider, model: resolution.model, policy_digest: resolution.policy_digest, invocation_id: 'gen-1', status: 'succeeded', duration_ms: 10, cost_usd: 1, exit_code: 0, output_digest: `sha256:${'a'.repeat(64)}` };
  assert.deepEqual(validateRunReceipt(base, resolution), []);
  assert.match(validateRunReceipt({ ...base, duration_ms: resolution.timeout_ms + 1 }, resolution).join('\n'), /timeout/);
  assert.match(validateRunReceipt({ ...base, cost_usd: resolution.max_cost_usd + 1 }, resolution).join('\n'), /cost ceiling/);
});

test('Claude Code adapter enforces role access and returns validated run receipts', () => {
  const resolution = resolveModel(policy(), 'evaluate');
  const args = claudeCodeArgs(resolution, 'review', { readOnly: true, structured: true });
  assert.ok(args.includes('claude-opus-5')); assert.match(args.join(' '), /Write,Edit,NotebookEdit,Bash/); assert.ok(args.includes('--json-schema'));
  const fake = () => ({ status: 0, stdout: JSON.stringify({ session_id: 'eval-1', duration_ms: 12, total_cost_usd: 0.5, structured_output: { recommendation: 'approve' } }), stderr: '' });
  const result = invokeClaudeCode({ resolution, prompt: 'review', cwd: ROOT, readOnly: true, structured: true, run: fake });
  assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.receipt.invocation_id, 'eval-1'); assert.equal(result.output.evaluator_invocation_id, 'eval-1');
});

test('handoff binds approved committed contract, Git commit, digest, and resolved evaluator', () => {
  const staged = mkdtempSync(path.join(tmpdir(), 'model-handoff-'));
  try {
    const source = path.join(ROOT, 'evals/fixtures/contract-planned');
    spawnSync('cp', ['-R', `${source}/.`, staged]);
    spawnSync('git', ['init', '-q'], { cwd: staged }); spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: staged }); spawnSync('git', ['config', 'user.name', 'test'], { cwd: staged });
    spawnSync('git', ['add', '.'], { cwd: staged }); spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'contract'], { cwd: staged });
    const file = path.join(staged, '.aidlc/artifacts/contracts/hyphen-titlecase.md');
    const handoff = createHandoff(staged, file, policy(), { from: 'generate', to: 'evaluate', sourceInvocationId: 'gen-1' });
    assert.match(handoff.git_commit, /^[a-f0-9]{40}$/); assert.match(handoff.contract_digest, /^sha256:/);
    assert.equal(handoff.target.model, 'claude-opus-5'); assert.equal(handoff.max_attempts, 3);
  } finally { rmSync(staged, { recursive: true, force: true }); }
});

test('evaluation is independent, behaviour-bound, fail-closed, and repair loops terminate', () => {
  const body = readFileSync(path.join(ROOT, 'evals/fixtures/contract-planned/.aidlc/artifacts/contracts/hyphen-titlecase.md'), 'utf8');
  const handoff = { change_id: 'hyphen-titlecase', contract_digest: 'sha256:contract', git_commit: 'abc1234', source_invocation_id: 'gen-1', attempt: 1 };
  const finding = { severity: 'important', behaviour_id: 'B1', file: 'src/app/text.py', line: 1, message: 'wrong', remedy: 'fix it' };
  const report = { schema: 'aidlc.evaluation/v1', change_id: handoff.change_id, contract_digest: handoff.contract_digest, git_commit: handoff.git_commit, evaluator_invocation_id: 'eval-1', recommendation: 'changes-requested', findings: [finding] };
  assert.deepEqual(validateEvaluation(report, handoff, body), []);
  assert.match(validateEvaluation({ ...report, evaluator_invocation_id: 'gen-1' }, handoff, body).join('\n'), /cannot evaluate/);
  assert.match(validateEvaluation({ ...report, findings: [{ ...finding, behaviour_id: 'B99' }] }, handoff, body).join('\n'), /unknown/);
  assert.equal(evaluationDecision(report, handoff, policy()).status, 'repair');
  assert.equal(evaluationDecision(report, { ...handoff, attempt: 3 }, policy()).status, 'exhausted');
});

test('CLI exposes model doctor and pinned resolution in an installed project', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'model-cli-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: root }); assert.equal(run(root, 'init', '--into', root).status, 0);
    assert.equal(run(root, 'models', 'doctor').status, 0);
    const resolved = run(root, 'models', 'resolve', 'evaluate', '--json'); assert.equal(resolved.status, 0, resolved.stderr);
    assert.equal(JSON.parse(resolved.stdout).model, 'claude-opus-5');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI handoff and ingest produce immutable bounded-loop receipts', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'model-flow-'));
  try {
    spawnSync('cp', ['-R', `${path.join(ROOT, 'evals/fixtures/contract-planned')}/.`, root]);
    mkdirSync(path.join(root, '.aidlc'), { recursive: true }); writeFileSync(path.join(root, '.aidlc/model-policy.json'), `${JSON.stringify(policy(), null, 2)}\n`);
    writeFileSync(path.join(root, '.aidlc/harness.toml'), readFileSync(path.join(ROOT, '.aidlc/templates/harness.toml'), 'utf8'));
    spawnSync('git', ['init', '-q'], { cwd: root }); spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root }); spawnSync('git', ['config', 'user.name', 'test'], { cwd: root });
    spawnSync('git', ['add', '.'], { cwd: root }); spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'approved contract'], { cwd: root });
    const handoffResult = run(root, 'models', 'handoff', 'hyphen-titlecase', '--from', 'generate', '--to', 'evaluate', '--invocation', 'gen-44');
    assert.equal(handoffResult.status, 0, handoffResult.stderr);
    const handoff = JSON.parse(readFileSync(handoffResult.stdout.trim(), 'utf8'));
    const report = { schema: 'aidlc.evaluation/v1', change_id: handoff.change_id, contract_digest: handoff.contract_digest, git_commit: handoff.git_commit, evaluator_invocation_id: 'eval-45', recommendation: 'changes-requested', findings: [{ severity: 'important', behaviour_id: 'B1', file: 'src/app/text.py', line: 1, message: 'Hyphen path is incomplete.', remedy: 'Implement and prove B1.' }] };
    const reportFile = path.join(root, 'evaluation.json'); writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    const ingested = run(root, 'models', 'ingest', 'hyphen-titlecase', '--file', reportFile);
    assert.equal(ingested.status, 1, 'changes requested is a non-zero gate'); assert.match(ingested.stdout, /repair/);
    const receipt = JSON.parse(readFileSync(path.join(root, '.aidlc/artifacts/evaluations/hyphen-titlecase-a1.json'), 'utf8'));
    assert.equal(receipt.decision.next_role, 'generate'); assert.equal(receipt.decision.next_attempt, 2);
    assert.equal(run(root, 'models', 'ingest', 'hyphen-titlecase', '--file', reportFile).status, 1, 'receipt cannot be overwritten');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI invokes a structured read-only evaluator and ingests its decision end to end', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'model-invoke-')); const fakeBin = mkdtempSync(path.join(tmpdir(), 'fake-claude-'));
  try {
    spawnSync('cp', ['-R', `${path.join(ROOT, 'evals/fixtures/contract-planned')}/.`, root]);
    mkdirSync(path.join(root, '.aidlc'), { recursive: true }); writeFileSync(path.join(root, '.aidlc/model-policy.json'), `${JSON.stringify(policy(), null, 2)}\n`); writeFileSync(path.join(root, '.aidlc/harness.toml'), readFileSync(path.join(ROOT, '.aidlc/templates/harness.toml'), 'utf8'));
    spawnSync('git', ['init', '-q'], { cwd: root }); spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root }); spawnSync('git', ['config', 'user.name', 'test'], { cwd: root }); spawnSync('git', ['add', '.'], { cwd: root }); spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'approved contract'], { cwd: root });
    const handoffResult = run(root, 'models', 'handoff', 'hyphen-titlecase', '--from', 'generate', '--to', 'evaluate', '--invocation', 'gen-90'); assert.equal(handoffResult.status, 0, handoffResult.stderr);
    const handoff = JSON.parse(readFileSync(handoffResult.stdout.trim(), 'utf8'));
    const output = { schema: 'aidlc.evaluation/v1', change_id: handoff.change_id, contract_digest: handoff.contract_digest, git_commit: handoff.git_commit, evaluator_invocation_id: 'model-placeholder', recommendation: 'approve', findings: [] };
    const executable = path.join(fakeBin, 'claude'); writeFileSync(executable, `#!/bin/sh\nprintf '%s' '${JSON.stringify({ session_id: 'eval-91', duration_ms: 25, total_cost_usd: 0.25, structured_output: output })}'\n`); chmodSync(executable, 0o755);
    const invoked = spawnSync(process.execPath, [BIN, 'models', 'invoke', 'evaluate', 'hyphen-titlecase'], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
    assert.equal(invoked.status, 0, invoked.stderr); assert.match(invoked.stdout, /approved/);
    const modelRun = JSON.parse(readFileSync(path.join(root, '.aidlc/artifacts/model-runs/hyphen-titlecase-evaluate-a1.json'), 'utf8'));
    const evaluation = JSON.parse(readFileSync(path.join(root, '.aidlc/artifacts/evaluations/hyphen-titlecase-a1.json'), 'utf8'));
    assert.equal(modelRun.invocation_id, 'eval-91'); assert.equal(evaluation.evaluator_invocation_id, 'eval-91'); assert.equal(evaluation.decision.status, 'approved');
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(fakeBin, { recursive: true, force: true }); }
});
