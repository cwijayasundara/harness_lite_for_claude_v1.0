// Five bindings, one process. There is no hooks/lib/ with 121 files.
//
// Every handler fails OPEN — a broken guard must never wedge a session. But unlike v6, a
// failure is written to the ledger as `errored` and surfaced at the next SessionStart, so a
// guard that has quietly stopped working is visible instead of indistinguishable from a pass.

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { findRepoRoot, PREFIX_CACHE_PATHS } from '../lib/paths.mjs';
import { check, render } from '../lib/runner.mjs';
import * as ledger from '../lib/ledger.mjs';
import { measure } from '../checks/budget.mjs';
import { refresh, staleSince } from '../lib/refresh.mjs';
import { writeBlocked, productionDenied, bashTouchesProtected, bashPlanBlocked } from '../lib/guard.mjs';

// In an installed project `.claude/bin/harness` is a bash shim; in this repository it is the
// executable itself, and `bash` on it dies with a shell syntax error. The banner printed the
// same line in both, so the harness's own first instruction did not run in its own repository.
const HARNESS = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const invocation = (cfg) =>
  path.resolve(cfg.layout.claude) === path.resolve(HARNESS)
    ? 'node .claude/bin/harness'
    : 'bash .claude/bin/harness';

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
  [/\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+\/(?!\w)/, 'rm -rf on an absolute root path'],
  [/\bgit\s+push\b.*(--force(?!-with-lease)|-f\b)/, 'git push --force (use --force-with-lease)'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard discards uncommitted work'],
  [/\bgit\s+checkout\s+--\s+\./, 'git checkout -- . discards uncommitted work'],
  [/\bchmod\s+-R\s+777\b/, 'chmod -R 777'],
  [/\bcurl\b[^|]*\|\s*(ba)?sh\b/, 'piping a download straight into a shell'],
];

export async function dispatch(event) {
  const input = await readStdin();
  let cfg = null;
  try { cfg = loadConfig(findRepoRoot(input.cwd || process.cwd())); } catch { /* no harness in this repo: stay out of the way */ }
  if (!cfg) return 0;

  try {
    switch (event) {
      case 'session-start': {
        const m = measure(cfg);
        const led = ledger.report(cfg.layout, { days: 30 });
        const noisy = led.controls.filter((c) => c.verdict === 'unreliable' || c.verdict === 'candidate-for-deletion').slice(0, 3);
        const lines = [
          `harness · ${cfg.project.name ?? path.basename(cfg.layout.root)}`,
          `check:  ${invocation(cfg)} check --stage fast --changed`,
          `budget: ${Object.entries(m).map(([k, v]) => `${k} ${v}/${cfg.limits[k] ?? '-'}`).join(' · ')}`,
          `ledger: ${led.rows} rows over ${led.runs} runs (30d)`,
        ];
        if (noisy.length) lines.push(`review: ${noisy.map((c) => `${c.control} (${c.verdict})`).join(', ')}`);
        const stale = staleSince(cfg);
        if (stale) lines.push(`graph:  STALE since ${stale} — verify anything load-bearing against the source`);
        if (cfg.guard?.require_plan) lines.push('plan:   product file edits need a committed approved plan that lists the path');
        else lines.push('plan:   if no approved plan covers a product file, write or amend plan.md before editing it');
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } }));
        return 0;
      }

      case 'pre-write': {
        const file = input.tool_input?.file_path ?? input.tool_input?.path ?? '';
        if (!file) return 0;
        const rel = path.relative(cfg.layout.root, path.resolve(cfg.layout.root, file));
        const hit = writeBlocked(rel, cfg);
        if (hit) { ledger.append({ stage: 'pre-write', control: 'write-guard', verdict: 'fail', ms: 0, findings: 1 }, cfg.layout); return deny(hit); }
        ledger.append({ stage: 'pre-write', control: 'write-guard', verdict: 'pass', ms: 0, findings: 0 }, cfg.layout);
        return 0;
      }

      case 'pre-bash': {
        const cmd = input.tool_input?.command ?? '';
        for (const [re, why] of [...DESTRUCTIVE, ...(cfg.guard.deny_bash ?? []).map((p) => [new RegExp(p), `denied by harness.toml [guard].deny_bash: ${p}`])]) {
          if (re.test(cmd)) { ledger.append({ stage: 'pre-bash', control: 'bash-guard', verdict: 'fail', ms: 0, findings: 1 }, cfg.layout); return deny(`${why}. If this is genuinely required, ask the human to run it.`); }
        }
        const prod = productionDenied(cmd, process.env);
        if (prod) { ledger.append({ stage: 'pre-bash', control: 'bash-guard', verdict: 'fail', ms: 0, findings: 1 }, cfg.layout); return deny(prod); }
        const planned = bashPlanBlocked(cmd, cfg);
        if (planned) { ledger.append({ stage: 'pre-bash', control: 'bash-guard', verdict: 'fail', ms: 0, findings: 1 }, cfg.layout); return deny(planned); }
        const p = bashTouchesProtected(cmd, PREFIX_CACHE_PATHS);
        if (p) { ledger.append({ stage: 'pre-bash', control: 'bash-guard', verdict: 'fail', ms: 0, findings: 1 }, cfg.layout); return deny(`this command writes to ${p} through the shell, which bypasses the write guard. Same rule applies: not mid-session.`); }
        ledger.append({ stage: 'pre-bash', control: 'bash-guard', verdict: 'pass', ms: 0, findings: 0 }, cfg.layout);
        return 0;
      }

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
        if (!existsSync(cfg.layout.graphDirty)) return 0;
        const r = refresh(cfg);
        const report = await check(cfg, { stage: 'stop', files: [] });
        const notes = [];
        if (!report.ok) notes.push('stage "stop" has findings — run: bash .claude/bin/harness check --stage stop');
        if (r.error) notes.push(`graph refresh failed (${r.error}) — the wiki is stamped STALE`);
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
