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
  // `tools` is one binding covering every tool the pre-tool guard has an opinion about. It used
  // to be two — `write` and `shell` — and adding a third for search would have been a sixth
  // binding against a ceiling of five. Merging is the better answer anyway: one entry point per
  // event, branching on tool name inside the dispatcher, which is what it already does per event.
  const matchers = { write: 'Write|Edit|MultiEdit', shell: 'Bash', tools: 'Write|Edit|MultiEdit|Bash|Grep|Glob' };
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

// lean-v2 B7. The generator/evaluator split, written into frontmatter rather than resolved by a
// routing subsystem. `models` is the `[models]` table; `text` is a SKILL.md or an agent .md.
//
// Rendered rather than hand-written because two files stating the same model id is two files that
// can disagree, and Law 3 says delete one. The registry is the one.
export function renderModel(text, model, extra = {}) {
  const fields = { model, ...extra };
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error('no frontmatter to render a model into');
  let front = match[1];
  for (const [key, value] of Object.entries(fields)) {
    front = new RegExp(`^${key}:.*$`, 'm').test(front)
      ? front.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`)
      : `${front}\n${key}: ${value}`;
  }
  return `---\n${front}\n---\n${text.slice(match[0].length)}`;
}

export function renderClaudeInstructions(source) {
  return `<!-- Generated from .aidlc/instructions.md; edit the canonical file and run harness init. -->\n${source.trim()}\n`;
}

// MEASURED 2026-09-16, M1 step 2: `harness init` into a repository that already had a CLAUDE.md
// adopted that file verbatim as `.aidlc/instructions.md` and never opened
// `templates/project-instructions.md`. Every eval fixture ships a `.claude/CLAUDE.md`, so all 22
// golden tasks have been running with none of the harness's own steering — no workflow line, no
// "paste the output of --stage stop", and not the paragraph that names "Make the export better"
// as the case to ask about, which is the verbatim prompt of `clarify-ambiguous`, failing since
// the 2026-09-06 record. A consumer installing into an existing repository got the same silence.
//
// The project's own file is not the thing to throw away either: it goes under the template's
// `## Project conventions`, the section that exists to be replaced. Pure, so the composition is
// tested without an install.
export function composeProjectInstructions(template, adopted = null) {
  const body = String(adopted ?? '').trim();
  if (!body) return template;
  const heading = /^##[ \t]+Project conventions[ \t]*$/m.exec(template);
  if (!heading) throw new Error('project-instructions template has no "## Project conventions" section to adopt into');
  const titled = /^#[ \t]+(.+)$/m.exec(body);
  const rest = (titled ? body.slice(0, titled.index) + body.slice(titled.index + titled[0].length) : body).trim();
  const head = titled ? template.replace(/^#[ \t]+.*$/m, `# ${titled[1].trim()}`) : template;
  return `${head.slice(0, head.indexOf(heading[0]))}${heading[0]}\n\n${rest}\n`;
}

// The files the harness writes into a consumer's tree. The project's own formatter has no reason
// to know about them, and on 2026-09-16 that cost a whole delivery.
//
// MEASURED, G24 pilot on `calculator` (.aidlc/evals/comparisons/2026-09-16T08-15-39-145Z): the
// implement turn wrote correct code in 87 s, then `--stage stop` failed `fmt` on CODEBASE-MAP.md —
// which the Stop hook had just generated. The driver spent a repair turn, USD 0.235 and 22 minutes
// on a file it regenerates, delivered nothing, and was killed on the suite deadline. The native
// arm shipped the same change in 56 s for USD 0.121. Reproduced in three steps: a staged project
// passes `--stage stop`, `harness map` writes the file, and the same command then fails forever.
//
// `.aidlc/state/` is already gitignored, but a formatter reads the working tree, not git.
export const GENERATED_PATHS = ['CLAUDE.md', 'CODEBASE-MAP.md', '.claude/', '.aidlc/'];

const IGNORE_HEADER = '# Written by harness init: these are generated, and regenerated. Not yours to format.';

// Append-only, and only what is missing: an ignore file is the project's. Returns the lines added.
export function ignoreFileAdditions(current, paths = GENERATED_PATHS) {
  const present = new Set(String(current ?? '').split('\n').map((l) => l.trim()).filter(Boolean));
  const missing = paths.filter((p) => !present.has(p));
  return missing.length ? { missing, next: `${String(current ?? '').trimEnd()}\n\n${IGNORE_HEADER}\n${missing.join('\n')}\n`.trimStart() } : null;
}
