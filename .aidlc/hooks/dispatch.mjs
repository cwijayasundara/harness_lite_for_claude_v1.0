// Four bindings, one process. There is no hooks/lib/ with 121 files.
//
// Every handler fails OPEN — a broken guard must never wedge a session. But unlike v6, a
// failure is written to the ledger as `errored` and surfaced at the next SessionStart, so a
// guard that has quietly stopped working is visible instead of indistinguishable from a pass.

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { findRepoRoot, PREFIX_CACHE_PATHS } from '../lib/paths.mjs';
import { check, render } from '../lib/runner.mjs';
import * as ledger from '../lib/ledger.mjs';
import { refresh } from '../lib/refresh.mjs';
import * as graph from '../lib/graph.mjs';
import * as codemap from '../lib/map.mjs';
import { writeRefusal, productionDenied, bashTouchesProtected, bashContractBlocked, commandText } from '../lib/guard.mjs';
import { invocation, sessionContext } from '../lib/session.mjs';

const readStdin = () => new Promise((res) => {
  let d = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { d += c; });
  process.stdin.on('end', () => { try { res(JSON.parse(d || '{}')); } catch { res({}); } });
  setTimeout(() => res(d ? (() => { try { return JSON.parse(d); } catch { return {}; } })() : {}), 4000);
});

const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  return 0;
};

const DESTRUCTIVE = [
  [/\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+\/(?!\w)/, 'rm -rf on an absolute root path', 'rm-root'],
  [/\bgit\s+push\b.*(--force(?!-with-lease)|-f\b)/, 'git push --force (use --force-with-lease)', 'git-force-push'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard discards uncommitted work', 'git-reset-hard'],
  [/\bgit\s+checkout\s+--\s+\./, 'git checkout -- . discards uncommitted work', 'git-checkout-dot'],
  [/\bchmod\s+-R\s+777\b/, 'chmod -R 777', 'chmod-777'],
  [/\bcurl\b[^|]*\|\s*(ba)?sh\b/, 'piping a download straight into a shell', 'curl-pipe-shell'],
  // Force-regenerating steering inputs needs a deliberate decision by the operator.
  [/(^|[|;&]\s*)(node\s+|bash\s+|sh\s+)?\S*harness\s+init\b[^|;&]*--force\b/, 'forcing init rewrites agent instructions or permissions', 'init-force'],
];

// close-the-harness B1, B2. the-suite-measures-this-harness F37: refused at a file outside its
// plan, an agent created a change, approved its own spec and plan with `--by`, and made the
// edit — every gate this harness has is a tool call away unless the one command that opens them
// is the human's. Same mechanism as `init-force`: this hook sees only the agent's commands, a
// human's shell runs no hook. This regex is a workflow reminder, not authentication.
const APPROVE_IS_THE_HUMANS = [/(^|[|;&]\s*)(node\s+|bash\s+|sh\s+)?\S*harness\s+approve\b/, 'approval is the human\'s gate, not the agent\'s', 'approve-is-the-humans'];


// The pre-tool guards, as functions rather than case bodies: one hook binding now covers every
// tool, and each of these is what it does for one of them.
function preWrite(input, cfg) {

        const file = input.tool_input?.file_path ?? input.tool_input?.path ?? '';
        if (!file) return 0;
        const rel = path.relative(cfg.layout.root, path.resolve(cfg.layout.root, file));
        const hit = writeRefusal(rel, cfg);
        if (hit) { ledger.append({ stage: 'pre-write', control: 'write-guard', rule: hit.rule, verdict: 'fail', ms: 0, findings: 1 }, cfg.layout); return deny(hit.message); }
        ledger.append({ stage: 'pre-write', control: 'write-guard', verdict: 'pass', ms: 0, findings: 0 }, cfg.layout);
  return 0;
}

function preBash(input, cfg) {

        const cmd = input.tool_input?.command ?? '';
        // lean-v2 B9. Every fire names the rule that fired it. Without this the audit reads
        // "bash-guard, 275 denials, 17.7% fired, keep" and cannot tell a caught mistake from a
        // false block — so the verdict is a guess, and OPERATING.md's weekly question "did
        // anything block you that should not have" has no data source. A rule id is the smallest
        // thing that makes the row answerable.
        const fired = (rule, message) => {
          ledger.append({ stage: 'pre-bash', control: 'bash-guard', rule, verdict: 'fail', ms: 0, findings: 1 }, cfg.layout);
          return deny(message);
        };
        // Heredoc bodies are input to a program, not commands. A script that *writes* a rule
        // into a file is not a script that runs it: writing the rule ids below was refused by
        // the `git push --force` rule for quoting it, the fourth false block of that shape in
        // one session. Quoted spans are deliberately left in place here — `bash -c "..."` is a
        // real invocation — so a commit message naming a destructive command is still refused.
        const scannable = commandText(cmd, { quotes: false });
        // B2: no eval task has a human, campaign or single prompt — the runner marks every one.
        const rules = [...DESTRUCTIVE, APPROVE_IS_THE_HUMANS, ...(cfg.guard.deny_bash ?? []).map((p) => [new RegExp(p), `denied by harness.toml [guard].deny_bash: ${p}`, `deny_bash:${p}`])];
        for (const [re, why, rule] of rules) {
          if (re.test(scannable)) return fired(rule ?? 'destructive', `${why}. If this is genuinely required, ask the human to run it.`);
        }
        const prod = productionDenied(cmd, process.env);
        if (prod) return fired('release-authorization', prod);
        const planned = bashContractBlocked(cmd, cfg);
        if (planned) return fired('contract-scope', planned);
        const p = bashTouchesProtected(cmd, PREFIX_CACHE_PATHS);
        if (p) return fired('prompt-prefix', `this command writes to ${p} through the shell, which bypasses the write guard. Instruction and permission changes require the approved scope.`);
        ledger.append({ stage: 'pre-bash', control: 'bash-guard', verdict: 'pass', ms: 0, findings: 0 }, cfg.layout);
  return 0;
}

// B11. A bare symbol searched with Grep or Glob is a question the index has already answered at
// 90% recall and a 96.5% token reduction. Advisory, never blocking: Law 7 makes the graph a cache
// with a miss path, and a guard that refuses a search is one people learn to route around. The
// call proceeds; the answer arrives alongside it.
function preSearch(input, cfg) {
  const pattern = String(input.tool_input?.pattern ?? '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{2,}$/.test(pattern)) return 0;
  try {
    const g = graph.load(cfg);
    if (!g) return 0;
    const callers = graph.query(g, 'callers', pattern, { root: cfg.layout.root });
    if (!callers.length) return 0;
    const where = [...new Set(callers.map((c) => c.module))].slice(0, 6);
    ledger.append({ stage: 'pre-tool', control: 'map-advice', verdict: 'pass', ms: 0, findings: 0 }, cfg.layout);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext:
      `graph: "${pattern}" appears in ${where.map((w) => `\`${w}\``).join(', ')}${callers.length > where.length ? ` and ${callers.length - where.length} more` : ''}.\n` +
      `Cheaper than a tree walk: ${invocation(cfg)} graph query callers ${pattern}  |  ${invocation(cfg)} pack ${pattern}` } }));
  } catch { /* the index is a cache: a miss costs the search nothing */ }
  return 0;
}

export async function dispatch(event) {
  const input = await readStdin();
  let cfg = null;
  try { cfg = loadConfig(findRepoRoot(input.cwd || process.cwd())); } catch { /* no harness in this repo: stay out of the way */ }
  if (!cfg) return 0;

  try {
    switch (event) {
      case 'session-start': {
        // Start of a session is the one honest place to rotate the run id: every row appended
        // from here until the next session belongs to this one. The 30-day report below reads
        // history, so rotating first costs it nothing.
        ledger.newRun(cfg.layout);
        // a-baseline-measures-what-ships B2. The payload is assembled by lib/session.mjs and by
        // nothing else. It used to be built here and reconstructed in baseline.mjs, and the two
        // drifted until the ratchet was grading a string this hook never wrote.
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: sessionContext(cfg) } }));
        return 0;
      }

      // One binding for every tool the guard has an opinion about, branching on tool name. Two
      // bindings plus a third for search would have been six against a ceiling of five, and the
      // budget is not a number to raise when it becomes inconvenient.
      case 'pre-tool': {
        const tool = input.tool_name ?? '';
        if (tool === 'Bash') return preBash(input, cfg);
        if (tool === 'Grep' || tool === 'Glob') return preSearch(input, cfg);
        return preWrite(input, cfg);
      }

      case 'pre-write': return preWrite(input, cfg);

      case 'pre-bash': return preBash(input, cfg);

      case 'post-write': {
        const file = input.tool_input?.file_path ?? input.tool_input?.path ?? '';
        if (!file) return 0;
        const rel = path.relative(cfg.layout.root, path.resolve(cfg.layout.root, file));
        // Cheap: append and return. The expensive coalesced work happens once, at Stop.
        try { mkdirSync(cfg.layout.state, { recursive: true }); appendFileSync(cfg.layout.graphDirty, JSON.stringify({ ts: Date.now(), file: rel }) + '\n'); } catch { /* fail open */ }
        const report = await check(cfg, { stage: 'fast', files: [rel] });
        if (!report.ok) {
          process.stderr.write(`harness check --stage fast failed on ${rel}\n\n${render(report, cfg.layout)}\n`);
          return 2; // exit 2 puts stderr in front of the model so it self-corrects this turn
        }
        return 0;
      }

      case 'stop': {
        // SubagentStop fires once per teammate; re-indexing on each is the dominant per-turn
        // cost and is pure waste. The top-level Stop coalesces every edit into one pass.
        if (input.hook_event_name === 'SubagentStop') return 0;

        // Waiting for a human gate is a legitimate end of a turn, including in trials.
        // The external test driver supplies the next decision; a Stop hook cannot approve it.

        const r = refresh(cfg);
        const report = await check(cfg, { stage: 'stop', files: [] });
        const notes = [];
        if (!report.ok) notes.push('stage "stop" has findings — run: .aidlc/bin/harness check --stage stop');
        if (r.error) notes.push(`graph refresh failed (${r.error}) — treat the index as stale`);

        // B11. The map is a guide, and a guide that has quietly stopped describing the tree is
        // worse than none. Recorded with a real verdict rather than a marker file: `graph-refresh`
        // reported 57 invocations and zero fires because passing was the only outcome it had.
        try {
          const g = graph.load(cfg);
          if (g) {
            const started = Date.now();
            const d = codemap.drift(cfg, g);
            ledger.append({ stage: 'stop', control: 'map-drift', rule: d.drifted ? 'stale-map' : null, verdict: d.drifted ? 'fail' : 'pass', ms: Date.now() - started, findings: d.drifted ? 1 : 0 }, cfg.layout);
            // every-control-fires-or-goes B5. 86 of 86 Stops recorded `stale-map`, because this
            // line only ever *said* to run `harness map` and nobody did — the F6 shape again. The
            // verdict above is the measurement (did this session change the tree's shape?); the
            // write below is the repair, so a stale map never outlives the session that made it.
            if (d.drifted) {
              codemap.write(cfg, g);
              notes.push(`${d.reason}${d.gone?.length ? ` (gone: ${d.gone.join(', ')})` : ''} — ${codemap.MAP_FILE} regenerated; commit it with your change`);
            }
          }
        } catch (e) { ledger.errored('map-drift', 'stop', e.message, cfg.layout); }

        if (notes.length) process.stdout.write(`harness: ${notes.join('; ')}\n`);
        return 0;
      }

      default: return 0;
    }
  } catch (e) {
    ledger.errored(`hook:${event}`, 'hook', e.message, cfg.layout);
    return 0; // fail open, but recorded
  }
}
