// Coalesced graph refresh. Ported in shape from the one part of v6's knowledge subsystem that
// was genuinely well built: append-on-edit, coalesce at Stop, TTL lock, fail open, STALE stamp.
// The two things v6 got wrong are fixed here — it indexes dotdirs, and on a cold clone it
// BUILDS rather than returning quietly.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as graph from './graph.mjs';
import { renderWiki } from './wiki.mjs';
import * as ledger from './ledger.mjs';

const LOCK_TTL_MS = 60_000;

// The lock is held iff the file is NON-EMPTY and recent. Release truncates rather than
// unlinks, because some mounts and sandboxes forbid unlink but permit truncate — and a lock
// that can be taken but never released is worse than no lock at all.
function takeLock(lockPath) {
  try {
    if (existsSync(lockPath)) {
      const st = statSync(lockPath);
      const held = st.size > 0 && Date.now() - st.mtimeMs < LOCK_TTL_MS;
      if (held) return false;   // someone else is mid-refresh
    }
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, String(process.pid));
    return true;
  } catch { return false; }
}

const releaseLock = (lockPath) => { try { writeFileSync(lockPath, ''); } catch { /* fail open */ } };

function drainDirty(file) {
  if (!existsSync(file)) return [];
  let rows = [];
  try { rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { /* malformed: rebuild whole */ }
  // Truncate rather than unlink: some sandboxes and mounts forbid unlink but permit truncate,
  // and a dirty list that cannot be cleared would re-index the same files forever.
  try { writeFileSync(file, ''); } catch { /* fail open */ }
  return [...new Set(rows.map((r) => r.file).filter(Boolean))];
}

const stampPath = (cfg) => path.join(cfg.layout.state, 'graph-stale');

export function staleSince(cfg) {
  try { return existsSync(stampPath(cfg)) ? readFileSync(stampPath(cfg), 'utf8').trim() : null; } catch { return null; }
}

export function refresh(cfg, { force = false } = {}) {
  const lock = path.join(cfg.layout.state, 'graph.lock');
  if (!takeLock(lock)) return { skipped: 'locked' };
  const started = Date.now();
  try {
    const dirty = drainDirty(cfg.layout.graphDirty);
    const previous = graph.load(cfg);
    if (!dirty.length && previous && !force) return { skipped: 'clean' };

    // Incremental when we have a previous graph and a bounded dirty list; full otherwise.
    const g = (previous && dirty.length && dirty.length < 200 && !force)
      ? graph.build(cfg, { only: dirty, previous })
      : graph.build(cfg);
    graph.save(cfg, g);
    renderWiki(cfg, g);
    try { writeFileSync(stampPath(cfg), ''); } catch { /* fail open */ }
    ledger.append({ stage: 'stop', control: 'graph-refresh', verdict: 'pass', ms: Date.now() - started, findings: 0, changed_files: dirty.length }, cfg.layout);
    return { modules: Object.keys(g.modules).length, dirty: dirty.length, incremental: g !== previous && dirty.length > 0, ms: Date.now() - started };
  } catch (e) {
    // A failed refresh must be VISIBLE. v6's renders failed into silence, and the planners
    // downstream went on trusting a map that had stopped moving.
    const now = new Date().toISOString();
    try { writeFileSync(stampPath(cfg), now); } catch { /* fail open */ }
    try {
      const g = graph.load(cfg);
      if (g) renderWiki(cfg, g, { stale: now });
    } catch { /* fail open */ }
    ledger.errored('graph-refresh', 'stop', e.message, cfg.layout);
    return { error: e.message, staleSince: now };
  } finally {
    releaseLock(lock);
  }
}
