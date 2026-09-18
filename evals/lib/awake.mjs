// M1.A. A live eval run measures wall-clock latency and enforces wall-clock deadlines. A laptop on
// battery does not stay awake to be measured, and everything downstream of that is wrong rather
// than missing: a turn that slept reports an inflated latency, and a deadline that ran through the
// sleep kills the child before it can finish.
//
// MEASURED 2026-09-16, the four G24 calculator pilots. Two of the four measured nothing:
//
//   run 4's native arm — the `npx vitest run` permission denial landed at 11:39:26.133Z and the
//   next entry in the session is `api_error` with `code: StreamSuspended`, "Stream watchdog
//   detected system suspend; aborting to retry on a fresh connection", at 11:45:03.764Z. pmset
//   records `Entering Sleep state due to 'Maintenance Sleep' ... 338 secs` at 12:39:25 +0100 and
//   the DarkWake at 12:45:03 +0100. The machine slept one second before the request and woke at
//   the exact second the watchdog fired. The CLI was retrying correctly (attempt 1 of 10); the
//   suite SIGKILLed it first.
//
//   run 4's harness arm — 1484535 ms inside `deliver`, of which 1402 s is pmset sleep across three
//   sleeps. That turn is on record as a 16x slowdown caused by machine load 8.4. It was 94.4%
//   asleep. Load and sleep are perfectly confounded across the four pilots, so the load threshold
//   the pilots produced rests on a misattribution and no pilot measured load at all.
//
//   runs 1 and 3 completed, and both fall inside windows pmset shows awake because somebody was at
//   the keyboard (`Wake from Deep Idle ... HID Activity`). Every run blamed on load is a run with
//   nobody present, which is exactly why the machine was allowed to sleep.
//
// Neither earlier suspect survives the transcripts. The permission system denied `npx vitest run`
// in run 3 as well, in 10 ms (11 ms in run 4), and run 3 completed — `toolDenialKind: permission-rule` is an answer,
// not a prompt with nowhere to go. The stdin pipe was closed by `cee53d1` and run 4 still hung.
//
// This repository has already paid for this once: `.claude/harness/artifacts/complete-native-comparisons/
// evidence.md:15` records the same contamination ("Sleep materially contaminated latency and
// process completion; this run cannot support a comparative latency decision"), and the remedy was
// an operator remembering to type `caffeinate -i`. It was never written down anywhere the runner
// could reach, so it regressed. An instrument that depends on the operator remembering is not an
// instrument.
//
// Two halves, because the first one can fail quietly. `keepAwake` stops the machine idling into
// sleep. `hostSleeps` reads the power log afterwards and says whether it slept anyway — a closed
// lid, a missing `caffeinate`, a forced sleep — so a contaminated number is marked rather than
// reported. Law 6: a measurement that did not happen must never wear the shape of one that did.
import { spawn as nodeSpawn, execFileSync } from 'node:child_process';

// Hold an idle-sleep assertion for the life of the run. Injected `spawn`/`platform`/`pid` so this
// is unit-testable with no real process and no real power management.
export function keepAwake({ platform = process.platform, spawn = nodeSpawn, pid = process.pid } = {}) {
  const inert = (why) => ({ held: false, why, release() {} });
  if (platform !== 'darwin') {
    // Linux CI runners are ephemeral virtual machines that do not idle-sleep, so there is nothing
    // to assert there and a missing assertion is not a defect. Say so rather than claim one.
    return inert(`no idle-sleep assertion on ${platform}; this is a darwin laptop problem`);
  }
  try {
    // MEASURED 2026-09-16, and this is the correction to the first version of this fix: `-i` alone
    // is not enough, and the detector below is what caught it. A run that printed
    // `host sleep: prevented` still slept 262 s of 449 s across two Maintenance Sleeps, because the
    // machine was never awake to begin with — `Sleep -> DarkWake -> Sleep`, lid shut, on battery.
    // `PreventUserIdleSystemSleep` prevents an AWAKE machine from idling into sleep; it does not
    // hold a machine that is in a dark wake, which returns to sleep when its maintenance finishes
    // no matter who is asserting. So declare user activity first: `-u -t` is the one assertion that
    // moves the system from dark wake to genuinely awake, and only then is there an idle to prevent.
    // One shot, not held — it is the transition that matters, and `-i` keeps it from happening again.
    try { spawn('caffeinate', ['-u', '-t', '2'], { stdio: 'ignore' }).unref?.(); }
    catch { /* the holder below is still worth taking */ }
    // -i prevents idle system sleep. -m keeps the disk from idling under a long model turn. -w ties
    // the child's life to ours, so a suite that crashes or is SIGKILLed cannot leave the operator's
    // laptop awake for the rest of the day.
    const child = spawn('caffeinate', ['-i', '-m', '-w', String(pid)], { stdio: 'ignore' });
    child.unref?.();
    let released = false;
    return {
      held: true,
      why: 'caffeinate -i -m: idle sleep and disk sleep are prevented for the length of this run',
      release() { if (released) return; released = true; try { child.kill(); } catch { /* already gone */ } },
    };
  } catch (error) {
    return inert(`caffeinate could not be started: ${error.message}`);
  }
}

export function awakeBanner(assertion) {
  return assertion.held ? `host sleep: prevented — ${assertion.why}` : `host sleep: NOT prevented — ${assertion.why}`;
}

// `pmset -g log` back to the start of the run. Every line carries its own offset, so the timestamp
// is built explicitly rather than handed to Date's loose parser.
const LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})\s+(.*)$/;

function stamp(match) {
  const [, day, time, sign, hh, mm] = match;
  return Date.parse(`${day}T${time}${sign}${hh}:${mm}`);
}

// What the machine did during the run, from the log the machine keeps itself. Returns
// `available: false` with a reason wherever the log cannot be read — never a zero that reads like
// a clean run.
export function hostSleeps({ sinceMs, untilMs = Date.now(), platform = process.platform, exec = defaultPmset }) {
  const blind = (why) => ({ available: false, why, events: [], asleepMs: null, asleepFraction: null, contaminated: false, spanMs: Math.max(0, untilMs - sinceMs) });
  if (platform !== 'darwin') return blind(`no power log to read on ${platform}`);

  let log;
  try { log = exec(); }
  catch (error) { return blind(error.message); }

  const spanMs = Math.max(0, untilMs - sinceMs);
  // Two passes: collect sleeps and wakes, then give each sleep an end. A pmset Sleep line carries
  // its own duration as a trailing `N secs`, backfilled when the machine wakes, and it agrees with
  // the next DarkWake to the second (12:39:25 + 338 s = 12:45:03). Prefer it; fall back to the next
  // wake for a sleep the log has not closed yet, and to the end of the run for one still in
  // progress — the only honest reading of a sleep that has not ended.
  const sleeps = [];
  const wakes = [];
  for (const line of log.split('\n')) {
    const m = LINE.exec(line.trim().length ? line : '');
    if (!m) continue;
    const body = m[6];
    const reason = /Entering Sleep state due to '([^']+)'/.exec(body);
    if (reason) {
      const secs = /(\d+)\s+secs\s*$/.exec(body);
      sleeps.push({ at: stamp(m), reason: reason[1], recordedMs: secs ? Number(secs[1]) * 1000 : null });
      continue;
    }
    // "Wake Requests" and "WakeDetails" share the first token and are not wakes; the body is what
    // distinguishes them, and only a real wake says what it woke from.
    if (/\b(?:DarkWake|Wake) from /.test(body)) wakes.push(stamp(m));
  }

  const events = [];
  let asleepMs = 0;
  for (const sleep of sleeps) {
    const nextWake = wakes.find((w) => w > sleep.at);
    const end = sleep.recordedMs != null ? sleep.at + sleep.recordedMs : (nextWake ?? untilMs);
    // Only the part that overlaps the run counts: a sleep that started before the run began, or
    // ran past its end, contaminated only the minutes they share.
    const from = Math.max(sleep.at, sinceMs);
    const to = Math.min(end, untilMs);
    if (to <= from) continue;
    events.push({ at: sleep.at, reason: sleep.reason, ms: to - from });
    asleepMs += to - from;
  }

  return {
    available: true,
    why: 'pmset -g log',
    events,
    asleepMs,
    spanMs,
    asleepFraction: spanMs > 0 ? asleepMs / spanMs : 0,
    contaminated: asleepMs > 0,
  };
}

function defaultPmset() {
  return execFileSync('pmset', ['-g', 'log'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// What a live run prints when it is done. Empty when the machine stayed awake, because a line that
// appears every run is a line nobody reads.
export function sleepBanner(report) {
  if (!report.available) return `host sleep: unknown — ${report.why}. Latency in this run is unverified.`;
  if (!report.contaminated) return '';
  const secs = (ms) => Math.round(ms / 1000);
  const pct = Math.round(report.asleepFraction * 1000) / 10;
  const reasons = [...new Set(report.events.map((e) => e.reason))].join(', ');
  return `HOST SLEPT DURING THIS RUN: ${secs(report.asleepMs)} s of ${secs(report.spanMs)} s (${pct}%) `
    + `across ${report.events.length} sleep${report.events.length === 1 ? '' : 's'} (${reasons}).\n`
    + '  Every latency and timeout in this run measured a sleeping laptop. Do not record it as a '
    + 'comparison; re-run it awake.';
}
