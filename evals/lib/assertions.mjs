// The assertion engine. Pure over a staged context, so the whole grading half of the eval
// suite is unit-testable with no model in the loop — which is the only reason to trust a
// green suite at all.
//
// ctx = { work, pristine, transcript, harness, usage, baseline }

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// A deliberately small glob: `*` inside one path segment. Enough for
// ".aidlc/artifacts/intent/*.md" and "tests/*.py", and small enough to have no bugs.
export function expand(root, pattern) {
  const parts = pattern.split('/');
  let dirs = [''];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const last = i === parts.length - 1;
    const next = [];
    for (const d of dirs) {
      const abs = path.join(root, d);
      if (!seg.includes('*')) {
        const p = path.join(d, seg);
        if (existsSync(path.join(root, p))) next.push(p);
        continue;
      }
      if (!existsSync(abs)) continue;
      const re = new RegExp('^' + seg.split('*').map(escapeRe).join('.*') + '$');
      for (const e of readdirSync(abs)) {
        if (!re.test(e)) continue;
        const p = path.join(d, e);
        if (last || statSync(path.join(root, p)).isDirectory()) next.push(p);
      }
    }
    dirs = next;
  }
  return dirs.filter(Boolean);
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Task authors reach for the inline flag `(?i)` because every other regex dialect has it.
// JavaScript does not, and an unsupported inline flag throws at construction — which the
// assertion engine would have recorded as a plain failure. Translating it here is cheaper
// than teaching everyone who writes a task that this one dialect is different.
export function toRegExp(pattern) {
  if (pattern instanceof RegExp) return pattern;
  const m = String(pattern).match(/^\(\?([ims]+)\)([\s\S]*)$/);
  return m ? new RegExp(m[2], m[1]) : new RegExp(String(pattern));
}

const IGNORE = /(^|\/)(\.git|\.aidlc\/state|__pycache__|\.pytest_cache|\.ruff_cache)(\/|$)/;

function walk(root, rel = '') {
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

function diffTrees(a, b, scope = null) {
  const inScope = (f) => !scope || scope.some((s) => f === s || f.startsWith(s.replace(/\/$/, '') + '/'));
  const fa = walk(a).filter(inScope);
  const fb = walk(b).filter(inScope);
  const changed = [];
  for (const f of new Set([...fa, ...fb])) {
    const pa = path.join(a, f);
    const pb = path.join(b, f);
    if (!existsSync(pa) || !existsSync(pb)) { changed.push(f); continue; }
    if (readFileSync(pa).compare(readFileSync(pb)) !== 0) changed.push(f);
  }
  return changed.sort();
}

function runStage(ctx, stage) {
  const r = spawnSync('node', [ctx.harness, 'check', '--stage', stage], { cwd: ctx.work, encoding: 'utf8', timeout: 300000 });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const ok = (pass, detail = '') => ({ pass, detail });

export const CHECKS = {
  fixture_tests_pass(ctx, want) {
    const r = runStage(ctx, 'stop');
    return ok(r.ok === want, r.ok ? '' : r.output.trim().split('\n').slice(0, 6).join(' | '));
  },
  harness_stage_passes(ctx, stage) {
    const r = runStage(ctx, stage);
    return ok(r.ok, r.ok ? '' : r.output.trim().split('\n').slice(0, 6).join(' | '));
  },
  files_unchanged(ctx, paths) {
    const changed = diffTrees(ctx.pristine, ctx.work, paths);
    return ok(changed.length === 0, changed.length ? `touched: ${changed.join(', ')}` : '');
  },
  workdir_unchanged(ctx, want) {
    const changed = diffTrees(ctx.pristine, ctx.work);
    return ok((changed.length === 0) === want, changed.length ? `touched: ${changed.slice(0, 8).join(', ')}` : '');
  },
  transcript_matches(ctx, re) {
    return ok(toRegExp(re).test(ctx.transcript), `no match for /${re}/`);
  },
  transcript_not_matches(ctx, re) {
    const m = ctx.transcript.match(toRegExp(re));
    return ok(!m, m ? `matched /${re}/ at "${m[0]}"` : '');
  },
  transcript_order(ctx, needles) {
    let at = 0;
    for (const n of needles) {
      const i = ctx.transcript.slice(at).search(toRegExp(n.startsWith('(?') ? n : `(?i)${n}`));
      if (i === -1) return ok(false, `"${n}" not found after position ${at}`);
      at += i + 1;
    }
    return ok(true);
  },
  file_exists(ctx, pattern) {
    const hits = expand(ctx.work, pattern);
    return ok(hits.length > 0, hits.length ? '' : `nothing matched ${pattern}`);
  },
  file_matches(ctx, [pattern, re]) {
    const hits = expand(ctx.work, pattern);
    if (!hits.length) return ok(false, `nothing matched ${pattern}`);
    const hit = hits.some((f) => toRegExp(re).test(readFileSync(path.join(ctx.work, f), 'utf8')));
    return ok(hit, hit ? '' : `no file matching ${pattern} contains /${re}/`);
  },
  file_not_matches(ctx, [pattern, re]) {
    const bad = expand(ctx.work, pattern).filter((f) => toRegExp(re).test(readFileSync(path.join(ctx.work, f), 'utf8')));
    return ok(bad.length === 0, bad.length ? `${bad.join(', ')} contains /${re}/` : '');
  },
  under_baseline(ctx, { metric, tolerance }) {
    const base = ctx.baseline?.[metric];
    if (base == null) return ok(true, `no baseline for ${metric} yet — recorded, not graded`);
    const actual = ctx.usage?.[metric];
    if (actual == null) return ok(false, `invoker reported no ${metric}`);
    return ok(actual <= base * tolerance, `${metric} ${actual} vs baseline ${base} x${tolerance}`);
  },
};

export const KNOWN = Object.keys(CHECKS);

export function evaluate(ctx, assertions) {
  return assertions.map((a) => {
    const [name, arg] = Object.entries(a)[0];
    const fn = CHECKS[name];
    if (!fn) return { name, pass: false, detail: `unknown assertion "${name}"` };
    try { return { name, ...fn(ctx, arg) }; }
    catch (e) { return { name, pass: false, detail: `assertion threw: ${e.message}` }; }
  });
}
