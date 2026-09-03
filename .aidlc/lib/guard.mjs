import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PREFIX_CACHE_PATHS } from './paths.mjs';
import { isCommitted, ownedFiles, validateContract } from './contract.mjs';

function contractScopeState(cfg) {
  const dir = cfg.layout?.contracts;
  if (!dir || !existsSync(dir)) return { declared: [], parseError: false };
  const declared = [];
  let parseError = false;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    try {
      const file = path.join(dir, name); const text = readFileSync(file, 'utf8');
      const validation = validateContract(cfg.layout.root, file);
      if (!validation.ok || validation.meta.plan_status !== 'approved' || !isCommitted(cfg.layout.root, file)) continue;
      const files = ownedFiles(text);
      if (!files) { parseError = true; continue; }
      declared.push(...files);
    } catch { parseError = true; }
  }
  return { declared, parseError };
}

function matchesDeclared(rel, declared) {
  return declared.some((d) => rel === d || rel.startsWith(d.replace(/\/$/, '') + '/'));
}

function artifactOrState(rel) {
  return rel.startsWith('.aidlc/artifacts/') || rel.startsWith('.aidlc/state/');
}

export function writeBlocked(rel, cfg) {
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

  // lean-v2 B6, completed. The refusal below is a cost control, not a safety one: rewriting a
  // prefix file mid-session invalidates the prompt cache for the remaining turns. That is worth
  // refusing a casual edit for, and not worth refusing a sealed plan for — `lean-v2` names both
  // `.aidlc/instructions.md` and `.claude/CLAUDE.md` under its Structure and ownership because
  // they list verbs the same plan deletes, and instructions that name commands which no longer
  // exist are a defect in every future session, not just this one.
  //
  // Unowned, it still refuses, because the ordinary case is a mid-session edit nobody planned.
  for (const p of PREFIX_CACHE_PATHS) {
    if (norm === p) {
      if (owned()) break;
      return `${p} is part of the cached prompt prefix. Editing it mid-session invalidates the prompt cache for every remaining turn. Ask the human to change it between sessions, or name it in an approved contract.`;
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
      return `${p} is listed in harness.toml [guard].protected_paths. Only a committed approved contract that names this exact path may change it.`;
    }
  }
  const lock = path.join(cfg.layout.state, 'test-lock.json');
  if (existsSync(lock)) {
    try {
      const { patterns = [], why = 'a bug fix is in progress' } = JSON.parse(readFileSync(lock, 'utf8'));
      for (const pat of patterns) {
        if (pat && norm.includes(pat)) return `${norm} is test-locked because ${why}. Fix the code, not the test. Run: .aidlc/bin/harness lock clear`;
      }
    } catch { /* a malformed lock must not block work */ }
  }
  if (requireContract && !artifactOrState(norm)) {
    try {
      if (!scope) scope = contractScopeState(cfg);
      const { declared, parseError } = scope;
      if (parseError && !declared.length) return null;
      if (!declared.length) return `${norm} needs a committed approved delivery contract before product files change. Create and approve the contract, or set [guard].require_contract = false.`;
      if (!matchesDeclared(norm, declared)) return `${norm} is outside every approved contract's Structure and ownership section.`;
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

export function productionDenied(cmd, env = process.env) {
  const text = commandText(cmd);
  if (!RELEASE.test(text) || !TARGET_ENV.test(text)) return null;
  if (env?.HARNESS_RELEASE_APPROVAL) return null;
  return 'A release to a live environment needs an authorization. Set HARNESS_RELEASE_APPROVAL, or ask the human to run it.';
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

  // A redirection writes to what follows it, and to nothing else. `2>&1` names a descriptor
  // rather than a file, and the character class below declines to match it.
  for (const [, target] of text.matchAll(/\d*>>?\s*([^\s;|&]+)/g)) targets.push(target);

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

export function bashContractBlocked(cmd, cfg) {
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
  // not one — stripping quotes and dropping what is left empty is what lets a commit trailer
  // through. Still regex-level, per the tree-sitter decision in docs/BUILD-PLAN.md Phase 3: a
  // `>` inside quoted prose followed by a word will still read as a write. That is the residual
  // and it is a narrower one than refusing every co-authored commit.
  //
  // artifactOrState wants a repo-relative path, and the string it replaces matched anywhere in
  // the command — including inside an absolute one. Rooting the target first keeps that carve-out
  // for `> /abs/repo/.aidlc/state/x`, which the narrowing would otherwise have started refusing.
  const root = cfg.layout?.root ? String(cfg.layout.root).replace(/\/+$/, '') + '/' : null;
  const targets = writeTargets(cmd)
    .map((t) => t.replace(/^['"]+|['"]+$/g, ''))
    .map((t) => (root && t.startsWith(root) ? t.slice(root.length) : t))
    .map((t) => t.replace(/^\.\//, ''))
    .filter((t) => t && !t.startsWith('/dev/') && !artifactOrState(t));
  if (!targets.length) return null;
  try {
    const { declared, parseError } = contractScopeState(cfg);
    if (parseError || declared.length) return null;
  } catch { return null; }
  return 'require_contract: a writeish shell command has no committed approved contract covering product files. Use the Write tool or approve a contract first.';
}

export function lockTests(cfg, { patterns = ['tests'], why = 'bug fix in progress' } = {}) {
  mkdirSync(cfg.layout.state, { recursive: true });
  const file = path.join(cfg.layout.state, 'test-lock.json');
  writeFileSync(file, JSON.stringify({ patterns, why }, null, 2) + '\n');
  return file;
}

export function clearLock(cfg) {
  const file = path.join(cfg.layout.state, 'test-lock.json');
  if (existsSync(file)) rmSync(file);
  return file;
}



