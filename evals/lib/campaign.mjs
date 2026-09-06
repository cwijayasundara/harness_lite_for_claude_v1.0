// Pure functions a campaign task needs and the 22 golden tasks never do: that a later sprint's
// requirement was not reachable early (B2), that every approved behaviour still has a test
// naming it (B6), and that a named file was edited rather than deleted and rewritten (B4).
// File-and-text checks over a staged directory, deterministic, no model, no spend.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { behavioursOf, proofRowsOf, testRowIn, promiseSpecs, currentChange } from '../../.aidlc/lib/artifacts.mjs';

// Shared with evals/lib/assertions.mjs's diffTrees, rather than each keeping its own copy that
// can silently drift apart — this one added node_modules and assertions.mjs's did not, until it
// imported this instead.
export const IGNORE = /(^|\/)(\.git|node_modules|\.aidlc\/state|__pycache__|\.pytest_cache|\.ruff_cache)(\/|$)/;

export function walk(root, rel = '') {
  const out = [];
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (IGNORE.test(r)) continue;
    if (e.isDirectory()) out.push(...walk(root, r));
    else out.push(r);
  }
  return out;
}

// B2. A campaign fixture holds no sprint prompts — they live in tasks.json, never the fixture —
// so the only way an earlier step could see a later one is a leak into the working copy itself:
// the fixture, a prior step's output, or an agent quoting the future back to itself. `needles`
// is the later step's requirement text, duplicated into the earlier step's assertion; that
// duplication is the price of a check that stays a pure function of the current working copy.
// Not a leak vector — text is what an agent or a fixture can actually plant a requirement in —
// and unbounded in a repository that acquires an image or a build artifact. Skipped by extension
// rather than sniffed by content, which stays a guess; a binary with no extension still gets
// read, same as today, but that is the rare case rather than the common one.
const BINARY_EXT = /\.(png|jpe?g|gif|bmp|ico|webp|pdf|zip|gz|tgz|tar|7z|rar|exe|dll|so|dylib|class|jar|woff2?|ttf|eot|otf|mp3|mp4|mov|avi|wasm|bin|pyc|db|sqlite3?)$/i;

export function unseenRequirements(dir, needles) {
  const list = Array.isArray(needles) ? needles : [needles];
  const found = [];
  for (const rel of walk(dir)) {
    if (BINARY_EXT.test(rel)) continue;
    let content;
    try { content = readFileSync(path.join(dir, rel), 'utf8'); } catch { continue; }
    for (const n of list) {
      if (found.includes(n)) continue;
      if (content.includes(n)) found.push(n);
    }
  }
  return {
    ok: found.length === 0,
    violations: found.map((n) => `"${n}" already appears in the working copy — a later sprint's requirement has leaked early`),
  };
}

// Test-file recognition (`looksLikeTestFile`/`testRowIn`) now lives in `.aidlc/lib/artifacts.mjs`,
// alongside `behavioursOf`/`proofRowsOf`, so B7's commit-time check and this file share one
// definition of "names a resolvable path" instead of two copies drifting apart.

// B6, amended: a spec that has quietly become fiction is checkable without a model only for the
// mechanical part — a behaviour with no Proof row at all, or a row that names a test file that
// no longer exists or no longer contains the identifier it explicitly claimed. The plan skill
// permits a row to name runtime evidence instead of a test ("manual check is only honest when
// the thing genuinely cannot be automated"), and this change's own plan does exactly that for
// five behaviours — such a row is reported unverifiable, never a violation. A behaviour retired
// on purpose is retired by removing it from spec.md, so it is simply absent from the loop below.
//
// `checked` counts every behaviour actually iterated below — violation, unverifiable or clean —
// so a caller can tell "nothing to check" (an empty repository, or nobody approved a spec yet)
// apart from "checked and clean" (`ok: true, checked: 0` vs `ok: true, checked: 3`). An empty
// suite is not a pass, and neither is an empty artifact chain.
export function behavioursHaveTests(dir) {
  const violations = [];
  const unverifiable = [];
  let checked = 0;
  const artifactsRoot = path.join(dir, '.aidlc', 'artifacts');
  if (!existsSync(artifactsRoot)) return { ok: true, violations, unverifiable, checked };
  // B2 (the-suite-measures-this-harness): reads `promiseSpecs()` — approved, or `migrated_from`
  // present — rather than `status: approved` alone. Twenty-three specs carry `migrated_from` and
  // no approval, because `lean-v2` deliberately invented none; they are promises the code must
  // keep all the same, and this check's reach goes from three specs to all of them. Expect it to
  // report far more than before — that is the point, not a regression to tune away.
  const cfg = { layout: { root: dir, artifacts: artifactsRoot } };
  for (const spec of promiseSpecs(cfg)) {
    const planPath = path.join(artifactsRoot, spec.slug, 'plan.md');
    if (!existsSync(planPath)) continue;
    const behaviours = behavioursOf(spec.body);
    if (!behaviours.length) continue;
    const proof = proofRowsOf(readFileSync(planPath, 'utf8'));
    for (const b of behaviours) {
      checked++;
      const evidence = proof.get(b);
      if (evidence === undefined) { violations.push(`${spec.slug} ${b}: plan.md's Proof table names no row`); continue; }
      const row = testRowIn(evidence);
      if (!row) { unverifiable.push(`${spec.slug} ${b}`); continue; }
      const testFile = path.join(dir, row.file);
      if (!existsSync(testFile)) { violations.push(`${spec.slug} ${b}: proof file "${row.file}" does not exist`); continue; }
      if (row.identifier && !readFileSync(testFile, 'utf8').includes(row.identifier)) {
        violations.push(`${spec.slug} ${b}: "${row.file}" no longer contains "${row.identifier}"`);
      }
    }
  }
  return { ok: violations.length === 0, violations, unverifiable, checked };
}

// a-diff-belongs-to-one-change B7. F26: sprint 3's plan was refused at the gate, and the sprint
// wrote `isOverdue` anyway because sprint 2's approved plan owned `src/ledger.mjs`. The guard
// now reads only the current change's plan; this assertion checks the same thing after the fact,
// over the diff since the previous step, so a run that routed around the guard cannot pass.
// `previous` is a snapshot directory of the working copy before the step — the runner keeps one.
export function diffOwnedByCurrentChange(dir, previous) {
  const changed = changedBetween(previous, dir).filter((f) => !/^\.aidlc\/(artifacts|state)(\/|$)/.test(f));
  const cfg = { layout: { root: dir, artifacts: path.join(dir, '.aidlc', 'artifacts') } };
  const current = currentChange(cfg);
  const slug = current?.slug ?? null;
  if (!changed.length) return { ok: true, violations: [], current: slug };
  if (!current) return { ok: false, violations: [`${changed.join(', ')} changed with no current change — no open change has an approved spec`], current: slug };
  if (!current.plan) return { ok: false, violations: [`${changed.join(', ')} changed under "${slug}", whose plan is not approved (${current.planState})`], current: slug };
  const owned = (f) => current.plan.owns.some((d) => f === d || f.startsWith(d.replace(/\/$/, '') + '/'));
  const unowned = changed.filter((f) => !owned(f));
  return {
    ok: unowned.length === 0,
    violations: unowned.map((f) => `${f} changed but the current change "${slug}" does not name it in ## Files`),
    current: slug,
  };
}

function changedBetween(a, b) {
  const changed = [];
  for (const f of new Set([...walk(a), ...walk(b)])) {
    const pa = path.join(a, f);
    const pb = path.join(b, f);
    if (!existsSync(pa) || !existsSync(pb)) { changed.push(f); continue; }
    if (readFileSync(pa).compare(readFileSync(pb)) !== 0) changed.push(f);
  }
  return changed.sort();
}

// B4. An agent that deletes the inconvenient test and writes a fresh one passes a naive suite —
// the file still exists, something still asserts something. What distinguishes an edit from a
// deletion-and-rewrite is whether the earlier proof survives: the specific identifiers (test
// names, in practice) a prior sprint's own assertion already required to exist. Those are known
// ahead of time, the same way B2's later-sprint text is, and are passed in rather than guessed.
export function modifiedNotReplaced(dir, file, markers) {
  const list = Array.isArray(markers) ? markers : [markers];
  const abs = path.join(dir, file);
  if (!existsSync(abs)) return { ok: false, violations: [`${file} no longer exists`] };
  const content = readFileSync(abs, 'utf8');
  const missing = list.filter((m) => !content.includes(m));
  return {
    ok: missing.length === 0,
    violations: missing.map((m) => `${file} no longer contains "${m}" — edited-in-place would have kept it`),
  };
}
