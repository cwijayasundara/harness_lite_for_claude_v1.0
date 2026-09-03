// The Claude projection: the two renderers `init` uses to generate `.claude/` from the canonical
// `.aidlc/` sources.
//
// lean-v2 cut 4 replaced lib/agent-adapters.mjs with this file. That module carried a five-agent
// manifest (claude, codex, cursor, copilot, grok), a capability negotiation table, per-adapter
// render and verify passes and a digest scheme — 185 lines and seven tests for four agents that
// had no conformance fixture, that the COMPANY-V1 plan itself said "require conformance fixtures
// before being called supported", and that nothing in this repository had ever rendered.
//
// The control plane stays agent-neutral: `.aidlc/instructions.md`, markdown skills, hook intents
// in `hooks/policy.json` and a CLI with exit codes are all portable. An adapter is a projection
// generator plus a conformance fixture, and it lands when a real feature has been built through
// that agent — not before. Codex, which has no hooks, would bind the same checks to git hooks.

export function renderClaudeHooks(policy, commandRoot = '${CLAUDE_PLUGIN_ROOT}') {
  if (policy?.schema !== 'aidlc.hook-policy/v1' || !Array.isArray(policy.bindings)) throw new Error('invalid aidlc.hook-policy/v1');
  const hooks = {};
  const eventNames = { 'session-start': 'SessionStart', 'pre-tool': 'PreToolUse', 'post-tool': 'PostToolUse', stop: 'Stop' };
  const matchers = { write: 'Write|Edit|MultiEdit', shell: 'Bash' };
  for (const binding of policy.bindings) {
    const event = eventNames[binding.event];
    if (!event || !binding.action || !Number.isInteger(binding.timeout)) throw new Error(`invalid hook binding: ${JSON.stringify(binding)}`);
    const entry = { hooks: [{ type: 'command', command: `node "${commandRoot}/.aidlc/bin/harness" hook ${binding.action}`, timeout: binding.timeout }] };
    if (binding.matcher) {
      if (!matchers[binding.matcher]) throw new Error(`unknown hook matcher: ${binding.matcher}`);
      entry.matcher = matchers[binding.matcher];
    }
    (hooks[event] ??= []).push(entry);
  }
  return { description: 'Generated Claude adapter projection of .aidlc/hooks/policy.json.', hooks };
}

export function renderClaudeInstructions(source) {
  return `<!-- Generated from .aidlc/instructions.md; edit the canonical file and run harness init. -->\n${source.trim()}\n`;
}
