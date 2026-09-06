#!/usr/bin/env node
// Opt-in, bounded real-Claude integration smoke. No model calls in the unit suite.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { review } from '../.aidlc/lib/review.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { layout } from '../.aidlc/lib/paths.mjs';
import { render } from '../.aidlc/lib/artifacts.mjs';
import { approvalDriver } from './lib/approvals.mjs';
import { loadDotEnv } from './run.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadDotEnv(root);
const models = loadConfig(root).models;
const work = mkdtempSync(path.join(tmpdir(), 'agent-mechanisms-'));
const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = () => { git('add', '.'); git('commit', '-qm', 'integration fixture'); return git('rev-parse', 'HEAD'); };
const evidence = { kind: 'agent-mechanisms-smoke', models, cli: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(), phases: [], usd: 0, billingComplete: true };
let session;
function phase(text) { evidence.phases.push(text); console.log(text); }
function invoke(prompt, tools = 'Read,Grep,Glob') {
  const out = spawnSync('claude', ['-p', prompt, '--model', models.generator,
    '--setting-sources', '', '--plugin-dir', root, '--tools', tools, '--permission-mode', tools.includes('Edit') ? 'acceptEdits' : 'dontAsk',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--output-format', 'json',
    '--max-budget-usd', '1', ...(session ? ['--resume', session] : [])],
  { cwd: work, env: process.env, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  if (out.error || out.signal || out.status !== 0) throw new Error(`Claude invocation failed: ${out.error?.code ?? out.signal ?? out.stderr ?? out.status}`);
  const result = JSON.parse(out.stdout);
  if (result.is_error || !result.result) throw new Error(`Claude incomplete: ${result.subtype}`);
  session = result.session_id;
  assert.ok(session, 'CLI must return a session id for real resume');
  evidence.usd += result.total_cost_usd ?? 0;
  return result.result;
}
try {
  git('init', '-q'); git('config', 'user.email', 'integration@example.invalid'); git('config', 'user.name', 'Simulated Test Driver');
  execFileSync(process.execPath, [path.join(root, '.aidlc/bin/harness'), 'init', '--into', work], { cwd: work, stdio: 'pipe' });
  const cfg = { layout: layout(work) };
  const artifacts = path.join(cfg.layout.artifacts, 'addition');
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(path.join(work, 'sum.mjs'), 'export const sum = (a, b) => a - b;\n');
  writeFileSync(path.join(artifacts, 'intent.md'), '# Addition\nReturn the arithmetic sum.\n');
  writeFileSync(path.join(artifacts, 'spec.md'), render({ status: 'draft' }, '# Addition\n### B1\nAdd positive integers.\n'));
  writeFileSync(path.join(artifacts, 'plan.md'), render({ status: 'draft' }, '# Plan\n## Files\n`sum.mjs`\n## Proof\n| B1 | Driver executes positive, negative and zero input cases |\n'));
  commit();
  const driver = approvalDriver(cfg);
  const initial = readFileSync(path.join(work, 'sum.mjs'), 'utf8');
  const paused = invoke('Read .aidlc/artifacts/addition/spec.md. This spec has not been approved. Summarize it briefly and request approval, then stop. Do not implement.');
  assert.ok(existsSync(cfg.layout.runId), 'the explicitly loaded plugin must execute SessionStart');
  evidence.plugin = JSON.parse(readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8')).name;
  phase('installed plugin loaded and its SessionStart hook executed');
  assert.match(paused, /approv/i);
  assert.equal(readFileSync(path.join(work, 'sum.mjs'), 'utf8'), initial);
  assert.throws(() => driver.assertImplementation('addition'));
  phase('actual model paused before approval; no implementation tools available');
  driver.decide({ slug: 'addition', kind: 'spec', decision: 'reject', reason: 'Include negative integers and zero.' });
  const corrected = invoke('The external test driver rejects the spec: it must also handle negative integers and zero. Return only revised Markdown for the spec, with heading ### B1. Do not implement; wait for approval.');
  assert.match(corrected, /negative/i); assert.match(corrected, /zero/i);
  writeFileSync(path.join(artifacts, 'spec.md'), render({ status: 'draft' }, corrected.replace(/^```(?:markdown|md)?\n|\n```$/g, '')));
  commit();
  driver.decide({ slug: 'addition', kind: 'spec', decision: 'approve' });
  driver.decide({ slug: 'addition', kind: 'plan', decision: 'approve' });
  driver.assertImplementation('addition');
  phase('same CLI session accepted rejection/correction; driver approved exact revisions');
  invoke('The external test driver has approved and committed the spec and plan. Read them. Fix sum.mjs to satisfy B1. Change only sum.mjs, then stop. The driver will execute the tests.', 'Read,Grep,Glob,Write,Edit');
  execFileSync(process.execPath, ['--input-type=module', '-e', "import assert from 'node:assert/strict'; import {sum} from './sum.mjs'; for (const [a,b] of [[2,3],[-2,-3],[-2,3],[0,0]]) assert.equal(sum(a,b),a+b);"], { cwd: work });
  driver.assertImplementation('addition');
  const base = commit();
  phase('resumed model implemented; independent runtime cases passed');
  writeFileSync(path.join(work, 'sum.mjs'), 'export const sum = (a, b) => a - b;\n');
  const candidate = commit();
  git('checkout', '--detach', base);
  const result = review({ root: work, base, candidate, model: models.evaluator, output: 'review.md', budgetUsd: 2 });
  evidence.usd += result.usd ?? 0;
  const findings = readFileSync(path.join(work, 'review.md'), 'utf8');
  assert.match(findings, /changes-requested/); assert.match(findings, /subtract|a - b|a-b/i);
  assert.match(readFileSync(path.join(work, 'sum.mjs'), 'utf8'), /\+/);
  phase('independent evaluator found seeded defect in explicit candidate; checkout unchanged');
  evidence.review = findings;
  evidence.revisions = { base, candidate };
  evidence.approvals = driver.events();
  evidence.pass = true;
} catch (error) {
  evidence.pass = false;
  evidence.billingComplete = false;
  evidence.reportedUsd = evidence.usd;
  evidence.usd = null;
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  const output = path.join(root, '.aidlc/evals/smoke/agent-mechanisms.json');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  rmSync(work, { recursive: true, force: true });
}
