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
  // `Read` joined `tools` with the read gate: same binding, one more branch in the dispatcher,
  // which is the whole point of having merged them. A whole-file read is the largest avoidable
  // input cost in a session and the hook cannot have an opinion about a tool it never sees.
  const matchers = { write: 'Write|Edit|MultiEdit', shell: 'Bash', tools: 'Write|Edit|MultiEdit|Bash|Grep|Glob|Read' };
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

// The paths that hold a credential and are never worth reading. Kept here rather than in
// harness.toml because this is not a project-specific list: `.env` means the same thing in every
// repository, and a project that has to remember to configure it is a project that will not.
export const SECRET_PATHS = ['.env', '.env.*'];

// why: MEASURED 2026-09-18. Both existing defences are about the tree — `.gitignore` makes the
// file untrackable and the commit stage's scanner fails a tracked `sk-ant-` — and neither is
// about the agent. Nothing stopped a session reading `.env` and putting the key in a transcript
// this repository then exports as evidence. The scanner cannot see that; the key never entered
// the tree. `permissions.deny` is the host's own mechanism for a rule of exactly this shape:
// unconditional, path-shaped, and evaluated before the tool call rather than after it.
//
// `protected_paths` deliberately does NOT come through here. It is conditional — guard.mjs
// admits a committed approved contract naming that exact path — and a deny rule cannot read a
// contract, so projecting it would silently remove the escape hatch the contract exists to be.
//
// `ignore` is the project's own ignore file: a `!` line naming one of these patterns *exactly*
// removes it, which is how a project that genuinely keeps no secret in `.env` opts out without
// editing this file.
//
// A `!` line does not punch a hole in a wider pattern, and `.env.example` is the case that
// settles it. Sparing the example means dropping `.env.*`, which is also `.env.production` —
// trading a real credential for the convenience of reading a template of key names. Claude's
// deny rules take no negation, so one of the two had to lose, and it is not the credential. The
// example stays denied; a human who wants to read it can, and pays one question for it.
export function renderClaudePermissions(allow, ignore = '') {
  const excepted = new Set(
    String(ignore ?? '').split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('!'))
      .map((line) => line.slice(1).trim()),
  );
  const deny = SECRET_PATHS
    .filter((p) => !excepted.has(p))
    .flatMap((p) => ['Read', 'Edit', 'Write'].map((tool) => `${tool}(${p})`));
  return { allow, deny };
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
