// G20. What a live product trial is allowed to run inside, and what that is actually worth.
//
// A product trial turns a real coding agent loose on a seeded product with Write, Edit and Bash.
// It used to run in a container; `the-harness-needs-no-container` removed that and replaced it
// with nothing, so the invoker refused every trial and the whole live half of the eval suite went
// dark. This restores the trials by naming two boundaries and being exact about the difference,
// because the difference is the only thing that matters here:
//
//   ci-runner — an ephemeral virtual machine that is destroyed when the job ends. This is an
//               OS-level boundary and the only one here that is. It is detected from the
//               environment, never assumed: a machine that merely sets CI=true is not one.
//
//   local     — the CLI's own permission system. Every tool call not on an explicit allowlist is
//               denied outright (`--permission-prompts none`), file tools cannot reach outside the
//               staged tree, every MCP server is off, and the operator's own settings are not
//               loaded. This is a POLICY boundary, not an OS one. It constrains a cooperating
//               agent through the CLI it is running under; it does not contain a program that has
//               already escaped, and an allowed command can still do whatever that command can do
//               — `node` opens sockets, `git` reaches the network. Use it on fixtures whose code
//               you wrote. It is not a place to run something you do not trust.
//
// The wrong thing to do here is to call the second one isolation. `the-harness-needs-no-container`
// B5 exists because a staged directory was once called a sandbox, and a name that overclaims is
// how a boundary stops being checked.

export const BOUNDARIES = ['ci-runner', 'local'];

// Exactly the commands a product trial needs to build, test and record its work. Anything else —
// a package install, a download, an ssh — is denied by the permission system rather than by a
// pattern, because an allowlist fails closed and a denylist fails open.
export const ALLOWED = [
  'Read', 'Grep', 'Glob', 'Write', 'Edit',
  'Bash(node:*)',
  'Bash(.claude/harness/bin/harness:*)',
  'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git status:*)', 'Bash(git diff:*)',
  'Bash(git log:*)', 'Bash(git rev-parse:*)', 'Bash(git show:*)',
  'Bash(ls:*)', 'Bash(cat:*)', 'Bash(mkdir:*)',
];

// An ephemeral CI runner, established from the environment rather than believed. GITHUB_ACTIONS
// with a run id is a hosted job that is torn down afterwards; `CI=true` on a laptop is a variable
// somebody exported.
export function isEphemeralRunner(env = process.env) {
  return env.GITHUB_ACTIONS === 'true' && Boolean(env.GITHUB_RUN_ID);
}

// Which boundary a run has, and why it does not have one when it does not. The requested value is
// the operator's explicit choice; a run that asks for nothing gets nothing, because a trial that
// silently picked a weaker boundary than the operator believed is the failure this whole module
// is about.
export function resolveBoundary({ requested = null, env = process.env } = {}) {
  if (isEphemeralRunner(env)) {
    return { kind: 'ci-runner', ok: true, os: true,
      why: 'an ephemeral CI runner, destroyed when the job ends' };
  }
  if (requested === 'local') {
    return { kind: 'local', ok: true, os: false,
      why: 'the CLI permission system: an explicit tool allowlist, everything else denied, no MCP servers, '
        + 'file tools confined to the staged tree. A policy boundary, not OS isolation — an allowed command '
        + 'can still do whatever that command can do. Use it on fixtures whose code you wrote.' };
  }
  if (requested && requested !== 'local') {
    return { kind: null, ok: false, os: false,
      why: `unknown boundary "${requested}" — the boundaries are: ${BOUNDARIES.join(', ')}` };
  }
  return { kind: null, ok: false, os: false,
    why: 'a live product trial runs a coding agent with Write, Edit and Bash. It needs a boundary: '
      + 'run it on an ephemeral CI runner, or pass --boundary local to accept the CLI permission '
      + 'boundary on a fixture whose code you wrote.' };
}

// The flags that make the local boundary true. Returned rather than applied, so the one place
// that decides what a boundary is is also the one place that says what it consists of.
export function boundaryArgs(boundary, { workdir }) {
  if (boundary?.kind !== 'local') return [];
  return [
    // Nothing that would prompt is granted: with no human to answer, "ask" means "deny".
    '--permission-mode', 'manual',
    '--permission-prompts', 'none',
    '--allowedTools', ALLOWED.join(','),
    // The fixture's own settings only. The operator's user settings, and whatever their plugins
    // grant, stay out of a measurement.
    '--setting-sources', 'project',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    // No additional directories: file tools reach the staged tree and nothing above it.
    '--add-dir', workdir,
  ];
}

// What a run prints before it spends anything. A boundary nobody was told about is a boundary
// nobody checked, and the local one in particular must never be read as isolation.
export function boundaryBanner(boundary) {
  if (!boundary?.ok) return `no boundary: ${boundary?.why ?? 'unavailable'}`;
  return `boundary: ${boundary.kind} — ${boundary.why}`
    + (boundary.os ? '' : '\n  This is not OS isolation. Do not run untrusted code under it.');
}
