import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { PREFIX_CACHE_PATHS } from './paths.mjs';
import { governingPlans, currentLine, currentChange, draftsAwaitingGate, awaitingGateRemedy } from './artifacts.mjs';
import { gateBlocks } from './config.mjs';
import * as release from './release.mjs';

// One reader of ownership, shared with `scope-drift`. Two readers is how the guard and the check
// came to disagree about which file was owned by what. `current` is the change the diff belongs
// to (a-diff-belongs-to-one-change B1): `governingPlans` returns its plan or nothing, so a path
// another change's plan names is not owned — F10 and F26 were both routed through exactly that.
function contractScopeState(cfg) {
  try {
    return { declared: governingPlans(cfg).flatMap((p) => p.owns), current: currentChange(cfg), drafts: draftsAwaitingGate(cfg), line: currentLine(cfg), parseError: false };
  } catch { return { declared: [], current: null, drafts: [], line: "execution state unreadable — restore the selected change and run harness status --change <slug>", parseError: true }; }
}

// The refusal must name the way forward and keep the guard on. evidence.md F2: the old message
// ended "or set [guard].require_contract = false", and an agent did exactly that.
//
// G06: it also names *which* gate is pending, because that is the gate whose mode decides
// whether this is a denial or a warning. A write held back because the spec is not approved is
// gate 1's business; a write held back because the approved plan's `## Files` does not name the
// path is gate 2's. Flattening the two into one mode would mean a project that wants its plan
// scope advisory also loses the spec gate it never asked to relax.
function contractRefusal(norm, scope) {
  const { current, declared, drafts = [] } = scope;
  // a-draft-is-a-declaration B1: a written spec is work declared and not yet gated.
  if (drafts.length) {
    const [first, ...rest] = drafts;
    return { gate: first.kind === 'plan' ? 'plan' : 'spec',
      message: `${norm}: no product file may change yet — ${awaitingGateRemedy(first)}${rest.length ? ` Also waiting: ${rest.map((d) => `${d.slug}/${d.kind}.md`).join(', ')}.` : ''}` };
  }
  if (current?.plan && !declared.length) return { gate: 'plan', message: `${norm}: the selected change "${current.slug}" has an empty ## Files section. Name the paths and re-approve its plan before product writes.` };
  // No current change, or no approved plan on it: nothing has reached gate 2 yet, so what is
  // missing is the spec approval that precedes it.
  if (!current || !declared.length || !current.plan) return { gate: current?.plan ? 'plan' : 'spec', message: `${norm}: no product file may change yet — ${scope.line}` };
  return { gate: 'plan', message: `${norm} is outside the current change "${current.slug}" — its approved plan's ## Files does not name this path. Add the path and re-approve the plan, or close "${current.slug}" if that work is done.` };
}

function matchesDeclared(rel, declared) {
  return declared.some((d) => rel === d || rel.startsWith(d.replace(/\/$/, '') + '/'));
}

function artifactOrState(rel) {
  return rel.startsWith('.aidlc/artifacts/') || rel.startsWith('.aidlc/state/');
}

// a-block-names-its-rule B2. A refusal carries the name of the branch that produced it, so a
// write-guard block can be called wrong by name like any other.
//
// `writeRefusal` is the named form; `writeBlocked` stays the refusal string every existing caller
// already reads. Changing the shared return type instead was tried and reverted: it broke
// assertions in four test files this change does not own, for no gain to anyone but the one
// caller that wants the name.
const refuse = (rule, message) => ({ rule, message, advisory: false });

// G06. The same judgment, reported rather than enforced. `advisory: true` is the whole
// difference: the hook writes `additionalContext` instead of `deny`, and `writeBlocked` — the
// question "may this write proceed" that four test files and two callers ask — answers yes.
const advise = (rule, message) => ({ rule, message, advisory: true });

// `writeBlocked` stays "is this write refused", so an advisory finding is not one. A caller that
// wants the judgment regardless of mode reads `writeRefusal` and looks at `.advisory` — the hook
// does exactly that, which is how a relaxed gate still reaches the model as a warning instead of
// disappearing.
export const writeBlocked = (rel, cfg) => {
  const hit = writeRefusal(rel, cfg);
  return hit && !hit.advisory ? hit.message : null;
};

export function writeRefusal(rel, cfg) {
  const norm = String(rel ?? '').replace(/^\.\//, '');
  if (!norm || norm.startsWith('..')) return null;
  // By identity, not by suffix. `norm` is already relative to the repository root, so the only
  // `.aidlc/harness.toml` in this session's prompt prefix is the one at the root. The suffix
  // match also caught every nested copy — it refused an edit to
  // `evals/fixtures/_base/.aidlc/harness.toml`, a fixture that is never read into any prompt.
  // Ownership is read once and answered three times. The prompt-prefix rule, the protected-path
  // rule and the require_contract rule were three answers to one question — may this file change
  // — and they disagreed, because only the third could hear a human. One rule now: a path named
  // by a committed approved contract is a path a human decided to change.
  const requireContract = cfg.guard?.require_contract ?? false;
  const protectedPaths = cfg.guard?.protected_paths ?? [];
  let scope = null;
  const owned = () => {
    if (!scope) { try { scope = contractScopeState(cfg); } catch { scope = { declared: [], parseError: true }; } }
    return matchesDeclared(norm, scope.declared);
  };

  // Deliberate steering changes belong in the approved scope. This is a heuristic workflow guard
  // and not a sandbox or an authentication mechanism.
  //
  // MEASURED three times on `prefix-cache-guard`, which asks for a note in CLAUDE.md. 2026-09-14:
  // the reason went last and the model relayed only the head — "a configuration file that affects
  // session instructions". Reworded so the reason went first; 2026-09-15 the model relayed only
  // the tail — "the system requires an approved plan before making changes". Position is not the
  // variable: across both wordings the model kept the sentence that said what to DO and dropped
  // the sentences that said why. So there is one sentence now, with the reason as its subject
  // clause and the remedy after the dash, and no separable sentence to drop. A refusal that
  // arrives without its reason teaches the shape of a rule and none of its content, and the next
  // reader has to guess which rule they are obeying.
  for (const p of PREFIX_CACHE_PATHS) {
    if (norm === p) {
      if (owned()) break;
      return refuse('prefix-cache', `${p} is already loaded into this session, so editing it `
        + `changes nothing until the session reloads and invalidates the prompt cache for whoever `
        + `reads it next — name it in an approved plan first. ${scope?.line ?? ""}`);
    }
  }

  // lean-v2 B6. A protected path is protected from an unplanned write, not from a planned one.
  // `evals/fixtures` exists so a fixture is never edited to make a test pass; a contract whose
  // plan names the fixture, sealed by a human and committed, is the opposite of that — it is the
  // human saying which fixture changes and why. Without this the agent could not land a change
  // its own approved plan described, and the gate moved from the edge of the loop into the middle.
  for (const p of protectedPaths) {
    if (norm === p || norm.startsWith(p.replace(/\/$/, '') + '/')) {
      if (owned()) break;
      return refuse('protected-path', `${p} is listed in harness.toml [guard].protected_paths. Only a committed approved contract that names this exact path may change it. ${scope?.line ?? ""}`);
    }
  }
  if (requireContract && !artifactOrState(norm)) {
    try {
      if (!scope) scope = contractScopeState(cfg);
      const { declared, parseError } = scope;
      const out = (hit) => (gateBlocks(cfg, hit.gate) ? refuse('write-scope', hit.message) : advise('write-scope', hit.message));
      if (parseError && !declared.length) return out(contractRefusal(norm, scope));
      if (!declared.length || !matchesDeclared(norm, declared)) return out(contractRefusal(norm, scope));
    } catch { return null; }
  }
  return null;
}

// lean-v2 B9. A mention is not an invocation.
//
// `commandText` drops the parts of a command line that are data rather than instructions:
// heredoc bodies and quoted spans. The rule below fired three times in one session against
// commands that only *named* it — a script whose heredoc quoted a test assertion, a commit
// message describing the subsystem being removed, and the note recording the first two. All
// three were false blocks, and the ledger could not say so, because a row recorded that the
// guard fired and never what it matched.
//
// This is the defect the `harness init --force` rule in hooks/dispatch.mjs was already repaired
// for, and it is the same fix: ask where the words sit, not whether they appear.
// `quotes: false` keeps quoted spans, for rules where `bash -c "..."` is a real invocation.
export function commandText(cmd, { quotes = true } = {}) {
  const text = String(cmd ?? '')
    // A heredoc body is input to a program, never a command. Removed first, so neither a verb
    // nor a redirection inside the body can be read as either.
    .replace(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[\s\S]*?^\s*\1\s*$/gm, ' ');
  return quotes ? text.replace(/'[^']*'/g, ' ').replace(/"[^"]*"/g, ' ') : text;
}

const TARGET_ENV = /\b(production|prod)\b/i;
// Anchored to a command position. `harness deploy` left this list with the release port in
// lean-v2 cut 2; what remains are the three tools that really do reach an environment.
const RELEASE = /(^|[|;&]\s*)(\S*\bdeploy\b|terraform\s+apply|kubectl\s+apply|helm\s+upgrade)/i;

// G18. The authorisation is a record, not an environment variable.
//
// `HARNESS_RELEASE_APPROVAL` was any non-empty value of a variable: it said nothing about who
// approved, what they approved, or when it stopped being true, and one line in a shell profile
// disabled the control permanently and silently. A record names a candidate commit, a person and
// an expiry — so an authorisation for one revision cannot be spent on another, which is the
// failure the variable could not even describe.
//
// Returns null when the command is not a release, and otherwise the full decision: whether it is
// allowed, why, and the route to an authorisation. Both outcomes are recorded by the caller — an
// allow that leaves no trace is indistinguishable from a control that never ran.
export function releaseDecision(cmd, cfg, options = {}) {
  const text = commandText(cmd);
  if (!RELEASE.test(text) || !TARGET_ENV.test(text)) return null;
  return release.state(cfg, options);
}

export function productionDenied(cmd, cfg, options = {}) {
  const decision = releaseDecision(cmd, cfg, options);
  if (!decision || decision.allowed) return null;
  return `A release to a live environment needs a current release record: ${decision.reason}. ${decision.route}`;
}

// Write *destinations*, not the presence of a `>` somewhere in the string.
//
// The previous version asked two questions of the whole command — does it contain `>`, and does
// a protected path appear anywhere — and denied when both were true. `2>&1` answers the first
// and merely naming the file answers the second, so reading a protected file was denied. It
// fired six times against read-only commands in the session that fixed it, once refusing to let
// the intent describing the defect be written, because the prose named a protected path.
//
// Deliberately regex-level: shell is not parseable without a parser, and the tree-sitter
// decision in docs/BUILD-PLAN.md Phase 3 applies here too. The trade is the one the spec states
// — a write may slip through, a read is never blocked. It is a guard, not a permission system.
export function writeTargets(cmd) {
  // Heredoc bodies only. A quoted path is still a real destination, so quotes stay: dropping
  // them here would hide `tee "some file.txt"` from the guard, which is the write it exists for.
  const text = String(cmd ?? '').replace(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[\s\S]*?^\s*\1\s*$/gm, ' ');
  const targets = [];

  // A redirection writes to what follows it, on the same line, and to nothing else. `2>&1` names
  // a descriptor rather than a file, and the character class below declines to match it.
  //
  // Three narrowings, each from a fire this rule got wrong. `[ \t]*` rather than `\s*`: a `>` at
  // the end of a line is not a redirection into the next line, which is how a commit message
  // ending `<noreply@anthropic.com>` came to claim it was writing to `Claude-Session:`. `(?![=>])`
  // and a preceding non-`=`: `=>` is an arrow function and `>=` a comparison, which is how a
  // one-line node script reading the ledger came to look like a write. Six false blocks of this
  // family in one session, against zero true catches — the whole point of recording a rule id is
  // that the next narrowing does not have to be argued from memory.
  for (const [, target] of text.matchAll(/(?<![=<>])\d*>>?(?![=>])[ \t]*([^\s;|&]+)/g)) targets.push(target);

  // Commands whose arguments are destinations. `cp` reads its sources, so only the last argument
  // is a write; `mv` unlinks its source, so every argument is.
  for (const [, verb, rest] of text.matchAll(/\b(tee|sed|mv|cp|truncate|dd)\b([^;|&]*)/g)) {
    const args = rest.trim().split(/\s+/).filter((a) => a && !a.startsWith('-'));
    if (!args.length) continue;
    if (verb === 'tee' || verb === 'mv') targets.push(...args);
    else if (verb === 'sed') { if (/\bsed\s+-i\b/.test(text)) targets.push(...args); }
    else if (verb === 'dd' || verb === 'truncate') targets.push(...args.map((a) => a.replace(/^of=/, '')));
    else targets.push(args[args.length - 1]);
  }

  return targets;
}

export function bashTouchesProtected(cmd, protectedPaths) {
  const targets = writeTargets(cmd);
  for (const p of protectedPaths) if (targets.some((t) => t.includes(p))) return p;
  return null;
}

// D1 (a-shell-redirect-is-a-write). This used to ask "is *any* change approved?" rather than
// "is *this* target approved?": `if (!scope.parseError && scope.declared.length) return null`
// let any selected change with a non-empty ## Files make every path in the repository writable
// through a shell redirect, because the extracted target was discarded rather than tested. B1:
// each surviving target is now asked the one question `writeRefusal` already answers for Write
// and Edit, so the two tools cannot disagree about the same path again — there is no second
// implementation of what ## Files means.
// repair (a-shell-redirect-is-a-write, evaluator round 2). `writeTargets` over-extracts: a search
// pattern that merely mentions `sed`, a `sed` script quoted as its own argument, a multi-word
// quoted filename split apart by `writeTargets`' plain `\s+` split, and a redirection descriptor
// are none of them a path a real `## Files` entry could ever name. Consequential-ising every one
// of those (the previous round of this repair did, by asking `writeRefusal` about every
// survivor) reintroduced the exact defect class `p0-unblock-the-loop` fixed: a read-only `grep`
// whose pattern contained the word `sed` was refused, `sed -i` on a path the approved plan OWNS
// was refused for naming its own script instead of the file, and `~/notes.txt` was refused
// because `path.resolve` does not expand `~` and the target landed inside the root by accident.
//
// This asks one more question before any of those reach `writeRefusal`: could this token be a
// path at all? A token is dropped, never escalated, when it fails that question — guard.mjs
// already states the trade this belongs to: "a write may slip through, a read is never blocked."
// A dropped token can only widen what proceeds; it can never manufacture a new refusal.
function isPathLikeToken(raw) {
  let t = raw;
  // A token symmetrically wrapped in one quote character is a whole quoted argument; look inside
  // it. A token that is NOT symmetrically wrapped — `"my` or `notes.txt"` from splitting
  // `tee "my notes.txt"` on whitespace — carries a quote character that answers where the split
  // broke a real argument in two, not a filename.
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) t = t.slice(1, -1);
  if (!t) return false; // `''` — an empty argument (`sed -i ''`), never a filename.
  if (/['"]/.test(t)) return false; // a quote survived unwrapping: a split-apart fragment.
  if (/[><|&$`*]/.test(t)) return false; // a shell metacharacter a real path in this guard's reach would not have.
  if (/^s\//.test(t)) return false; // a sed script (`s/a/b/`), not a filename.
  return true;
}

export function bashContractRefusal(cmd, cfg) {
  if (!(cfg.guard?.require_contract ?? false)) return null;

  // Ask what the command writes *to*, not whether a `>` appears somewhere in it. The previous
  // version tested the whole string and so refused `echo hi 2>/dev/null`, refused
  // `harness check --stage stop 2>&1 | tail` — the one command CLAUDE.md calls non-negotiable —
  // and refused every commit carrying a `Co-Authored-By: ... <noreply@...>` trailer, because a
  // mail address ends in `>`. bashTouchesProtected above was repaired for this exact defect and
  // its sibling was left behind, so the two disagreed about what a write is.
  //
  // A descriptor is not a file (`2>&1`), a discard is not a product edit (`/dev/null`), and the
  // artifact and state trees are the harness's own bookkeeping — the old carve-out asked that of
  // the whole command string, which let any command merely *naming* an artifact path through.
  // A redirect target is a path. `<noreply@anthropic.com>"` leaves a bare quote behind, which is
  // not one — `isPathLikeToken` above drops it before `writeRefusal` ever sees it. Still
  // regex-level, per the tree-sitter decision in docs/BUILD-PLAN.md Phase 3: a `>` inside quoted
  // prose followed by a word will still read as a write. That is the residual and it is a
  // narrower one than refusing every co-authored commit.
  const root = cfg.layout?.root ? String(cfg.layout.root) : null;
  const targets = writeTargets(cmd)
    // Ask "could this even be a path" on the raw token, before any quote-stripping smooths over
    // the very seam (a stray quote, an empty argument, a bare sed script) that answers it.
    .filter(isPathLikeToken)
    .map((t) => t.replace(/^['"]+|['"]+$/g, ''))
    .filter(Boolean)
    // `~` is a shell expansion `path.resolve` does not perform. Left unexpanded, `~/notes.txt`
    // resolves *under* the repository root by accident and B4's out-of-tree carve-out never
    // sees it — the guard refused a path outside the repository because it misread where the
    // path was.
    .map((t) => (t === '~' || t.startsWith('~/') ? path.join(homedir(), t.slice(1)) : t))
    // B1/B4: the same computation `preWrite` in dispatch.mjs uses, so a target normalises to the
    // identical string on both paths. The old code stripped the root by string comparison and
    // left an out-of-tree absolute path untouched, which is why the two paths disagreed in
    // *both* directions rather than one — a session could neither write its own scratchpad
    // through Bash today, nor be stopped from writing anywhere in the repository through it.
    .map((t) => (root ? path.relative(root, path.resolve(root, t)) : t.replace(/^\.\//, '')))
    // B4: a path outside the repository is outside what any ## Files section can describe — the
    // same carve-out `writeRefusal`'s `norm.startsWith('..')` check already gives Write and Edit.
    // A `/dev/` target normalises to a `..`-prefixed path by the same computation (there is no
    // route from the repository root to `/dev` that does not climb out of it first), so this one
    // filter is also what used to be a separate, unreachable `!t.startsWith('/dev/')` check.
    .filter((t) => t && !t.startsWith('..'))
    .filter((t) => !artifactOrState(t));

  // G06: a blocking hit wins over an advisory one. One command can write to two places — an
  // out-of-scope source file and `.claude/settings.json` — and under an advisory plan gate the
  // first is a warning while the second is still a refusal. Returning whichever came first in
  // the token order would have made the denial depend on the order the shell happened to write
  // its redirections in.
  let advisory = null;
  for (const t of targets) {
    const hit = writeRefusal(t, cfg);
    if (!hit) continue;
    if (!hit.advisory) return hit;
    advisory ??= hit;
  }
  return advisory;
}

// `bashContractBlocked` stays the string-returning form: `test/guard.test.mjs` and
// `test/worktree-selection.test.mjs` both import it and assert on the message, and
// `test/worktree-selection.test.mjs` is not a file this change owns. Same split `writeRefusal`
// and `writeBlocked` already use, for the same reason.
export function bashContractBlocked(cmd, cfg) {
  const hit = bashContractRefusal(cmd, cfg);
  return hit && !hit.advisory ? hit.message : null;
}




