import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, BIN } from './_paths.mjs';
import { manifestDigest, renderClaudeHooks, renderClaudeInstructions, validateAgentManifest } from '../.aidlc/lib/agent-adapters.mjs';

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-adapter-v1-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

test('agent manifest makes evaluator independence a portable invariant', () => {
  const manifest = {
    schema: 'aidlc.agent-manifest/v1', enabled: ['claude'], roles: {
      specify: { access: 'write', isolation: 'fresh-context', model_policy: 'generation' },
      generate: { access: 'write', isolation: 'working-context', model_policy: 'generation' },
      evaluate: { access: 'write', isolation: 'working-context', model_policy: 'evaluation' },
      diagnose: { access: 'read-only', isolation: 'fresh-context', model_policy: 'evaluation' }
    }, required_capabilities: ['instructions'], optional_capabilities: []
  };
  assert.match(validateAgentManifest(manifest).join('\n'), /evaluator access must be read-only/);
  assert.match(validateAgentManifest(manifest).join('\n'), /fresh-context or worktree/);
});

test('doctor negotiates provider capability gaps without silently weakening requirements', () => {
  const root = repo();
  try {
    const healthy = run(root, 'agents', 'doctor');
    assert.equal(healthy.status, 0, healthy.stderr);
    assert.match(healthy.stdout, /PASS  claude/);
    assert.match(healthy.stdout, /PASS  codex.*optional unavailable: hooks, model-pinning/);
    assert.match(healthy.stdout, /PASS  cursor/);
    assert.match(healthy.stdout, /PASS  copilot.*optional unavailable: model-pinning/);
    assert.match(healthy.stdout, /PASS  grok.*optional unavailable: model-pinning/);

    const file = path.join(root, '.aidlc', 'agents.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.required_capabilities.push('hooks');
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    const unhealthy = run(root, 'agents', 'doctor');
    assert.equal(unhealthy.status, 1);
    assert.match(unhealthy.stdout, /codex lacks required capabilities: hooks/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('every supported adapter renders the generic launcher and only native projections', () => {
  const root = repo();
  try {
    const launcher = path.join(root, '.aidlc/bin/harness');
    assert.ok(existsSync(launcher));
    const listed = run(root, 'agents', 'list', '--json');
    assert.equal(listed.status, 0, listed.stderr);
    const providers = JSON.parse(listed.stdout).map(({ name }) => name);
    assert.deepEqual(providers, ['claude', 'codex', 'cursor', 'copilot', 'grok']);
    for (const provider of providers) {
      const target = path.join(root, `rendered-${provider}`);
      const rendered = run(root, 'agents', 'render', provider, '--into', target);
      assert.equal(rendered.status, 0, `${provider}: ${rendered.stderr}`);
      assert.equal(run(root, 'agents', 'verify', provider, '--into', target).status, 0);
      for (const relative of rendered.stdout.trim().split('\n')) {
        const content = readFileSync(path.join(target, relative), 'utf8');
        if (/\.(?:md|mdc|json)$/.test(relative)) assert.doesNotMatch(content, /node \.claude\/bin\/harness/);
      }
    }
    const generic = spawnSync(launcher, ['agents', 'list'], { cwd: root, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: A } });
    assert.equal(generic.status, 0, generic.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Claude and Codex adapters deterministically render disposable native shells', () => {
  const root = repo();
  const claudeTarget = path.join(root, 'rendered-claude');
  const codexTarget = path.join(root, 'rendered-codex');
  try {
    assert.equal(run(root, 'agents', 'render', 'claude', '--into', claudeTarget).status, 0);
    assert.equal(run(root, 'agents', 'render', 'codex', '--into', codexTarget).status, 0);
    assert.ok(existsSync(path.join(claudeTarget, '.claude/agents/aidlc-evaluator.md')));
    assert.ok(existsSync(path.join(claudeTarget, '.claude/hooks/aidlc-hooks.json')));
    assert.ok(existsSync(path.join(codexTarget, 'AGENTS.md')));
    assert.ok(existsSync(path.join(codexTarget, '.agents/skills/aidlc-delivery/SKILL.md')));

    const manifest = JSON.parse(readFileSync(path.join(root, '.aidlc/agents.json'), 'utf8'));
    assert.match(readFileSync(path.join(codexTarget, 'AGENTS.md'), 'utf8'), new RegExp(manifestDigest(manifest)));
    assert.equal(run(root, 'agents', 'verify', 'claude', '--into', claudeTarget).status, 0);
    assert.equal(run(root, 'agents', 'verify', 'codex', '--into', codexTarget).status, 0);

    writeFileSync(path.join(codexTarget, 'AGENTS.md'), 'edited\n');
    const stale = run(root, 'agents', 'verify', 'codex', '--into', codexTarget);
    assert.equal(stale.status, 1);
    assert.match(stale.stdout, /AGENTS.md: stale or edited/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('renderer refuses to overwrite a human-owned native instruction file', () => {
  const root = repo();
  const target = path.join(root, 'owned');
  try {
    spawnSync('mkdir', ['-p', target]);
    writeFileSync(path.join(target, 'AGENTS.md'), '# Human instructions\n');
    const result = run(root, 'agents', 'render', 'codex', '--into', target);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to overwrite unmanaged file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Claude hook projection is generated from the canonical hook policy', () => {
  const policy = JSON.parse(readFileSync(path.join(A, 'hooks', 'policy.json'), 'utf8'));
  const projected = JSON.parse(readFileSync(path.join(A, 'adapters', 'claude', 'hooks.json'), 'utf8'));
  assert.deepEqual(projected, renderClaudeHooks(policy));
});

test('Claude project instructions are generated from the canonical instructions', () => {
  const source = readFileSync(path.join(A, 'instructions.md'), 'utf8');
  const projected = readFileSync(path.join(path.dirname(A), '.claude', 'CLAUDE.md'), 'utf8');
  assert.equal(projected, renderClaudeInstructions(source));
});
