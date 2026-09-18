// M1.A. Two of four G24 pilots measured nothing because the laptop went to sleep in the middle of
// a model turn, and the suite's wall-clock deadline kept running while it slept.
//
// MEASURED 2026-09-16, and the correlation is exact to the second:
//   run 4, native arm — the `npx vitest run` denial returned at 11:39:26.133Z, and the very next
//   session entry is `api_error` / `StreamSuspended` — "Stream watchdog detected system suspend" —
//   at 11:45:03.764Z. `pmset -g log` records `Sleep ... 'Maintenance Sleep' ... 338 secs` at
//   12:39:25 +0100 and the matching DarkWake at 12:45:03 +0100. The machine slept one second
//   before the request and woke the second the watchdog fired.
//   run 4, harness arm — 1484535 ms of `deliver`, of which 1402 s is pmset sleep: 94.4% of that
//   turn was a sleeping laptop, not the load-8.4 slowdown it was recorded as.
//   runs 1 and 3 — both completed, and both ran inside a window pmset shows the machine awake
//   because somebody was at the keyboard (`Wake ... HID Activity`).
//
// The permission system was never the variable: it denied `npx vitest run` in run 3 too, in 10 ms,
// and run 3 completed. The stdin pipe was never the variable either; `cee53d1` closed it and run 4
// still hung.
//
// This repository has already paid for this once. `.aidlc/artifacts/complete-native-comparisons/
// evidence.md:15` records the same contamination, and the fix was an operator remembering to type
// `caffeinate -i`. An instrument that depends on the operator remembering is not an instrument,
// so it lives in the runner now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keepAwake, hostSleeps, sleepBanner } from '../evals/lib/awake.mjs';

// Verbatim from `pmset -g log` on the machine that ran the pilots. This excerpt stops at the
// 13:02:50 wake, so it holds two of run 4's three sleeps — 1360 s of the real 1402 s. The numbers
// asserted below are this excerpt's, which is why they are 91.6% and not the full log's 94.4%.
const PMSET = [
  "2026-09-16 12:32:52 +0100 Sleep               \tEntering Sleep state due to 'Idle Sleep':TCPKeepAlive=active Using Batt (Charge:75%) 348 secs",
  "2026-09-16 12:32:53 +0100 Wake Requests       \t[process=mDNSResponder request=Maintenance deltaSecs=7198 wakeAt=2026-09-16 14:32:52 info=\"upkeep wake\"]",
  "2026-09-16 12:38:40 +0100 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to smc.sysState.Wake(0x70070000) wifibt SMC.OutboxNotEmpty/ Using BATT (Charge:75%) 45 secs",
  "2026-09-16 12:38:40 +0100 WakeDetails         \tDriverReason:smc.sysState.Wake(0x70070000) - DriverDetails:",
  "2026-09-16 12:39:25 +0100 Sleep               \tEntering Sleep state due to 'Maintenance Sleep':TCPKeepAlive=active Using Batt (Charge:75%) 338 secs",
  "2026-09-16 12:45:03 +0100 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to smc.sysState.Wake(0x70070000) wifibt SMC.OutboxNotEmpty/ Using BATT (Charge:75%) 45 secs",
  "2026-09-16 12:45:48 +0100 Sleep               \tEntering Sleep state due to 'Maintenance Sleep':TCPKeepAlive=active Using Batt (Charge:75%) 1022 secs",
  "2026-09-16 13:02:50 +0100 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to NUB.SPMI0Sw3IRQ nub-spmi0.0x02 rtc/SleepService Using BATT (Charge:75%) 2 secs",
].join('\n');

const at = (hhmmss) => Date.parse(`2026-09-16T${hhmmss}+01:00`);
const exec = () => PMSET;

test('A1 a live run that slept reports the sleep it slept through, not the wall clock it inflated', () => {
  // Run 4's harness arm: launched 12:38:49 local, killed on its deadline 1484535 ms later.
  const started = at('12:38:49');
  const report = hostSleeps({ sinceMs: started, untilMs: started + 1484535, platform: 'darwin', exec });

  assert.equal(report.available, true, 'pmset is the evidence; without it there is no verdict');
  assert.deepEqual(report.events.map((e) => e.reason), ['Maintenance Sleep', 'Maintenance Sleep']);
  // 338 s + 1022 s. The trailing `N secs` on a pmset Sleep line is the sleep's own duration, and
  // it agrees with the next DarkWake to the second — 12:39:25 + 338 s = 12:45:03.
  assert.equal(report.asleepMs, (338 + 1022) * 1000);
  assert.equal(report.contaminated, true);
  // The number that matters: the turn recorded as a 16x load slowdown was 91.6% asleep.
  assert.equal(Math.round(report.asleepFraction * 1000) / 10, 91.6);
  assert.match(sleepBanner(report), /HOST SLEPT/);
  assert.match(sleepBanner(report), /1360 s of 1485 s \(91\.6%\)/);
});

test('A2 a run inside an awake window is not marked, so the mark keeps meaning something', () => {
  // A run that merely began inside a sleep is still contaminated.
  const midSleep = hostSleeps({ sinceMs: at('12:33:30'), untilMs: at('12:38:00'), platform: 'darwin', exec });
  assert.equal(midSleep.contaminated, true);

  const awake = hostSleeps({ sinceMs: at('12:45:10'), untilMs: at('12:45:40'), platform: 'darwin', exec });
  assert.equal(awake.asleepMs, 0);
  assert.equal(awake.contaminated, false);
  assert.equal(sleepBanner(awake), '');
});

test('A3 only the part of a sleep that overlaps the run is counted', () => {
  // The run starts after the 12:45:48 sleep began and ends before it ended: 12:50:00 -> 12:55:00.
  const report = hostSleeps({ sinceMs: at('12:50:00'), untilMs: at('12:55:00'), platform: 'darwin', exec });
  assert.equal(report.asleepMs, 5 * 60 * 1000, 'the whole run was inside one sleep');
  assert.equal(report.asleepFraction, 1);
});

test('A4 where the log cannot be read the run says so rather than reporting zero sleep', () => {
  const blind = hostSleeps({ sinceMs: 0, untilMs: 1, platform: 'linux', exec });
  assert.equal(blind.available, false);
  assert.equal(blind.contaminated, false);
  assert.match(blind.why, /linux/);
  // Never a silent zero: `asleepMs: 0` from an unread log is the measurement-shaped non-measurement
  // this repository keeps banning.
  assert.equal(blind.asleepMs, null);

  const broken = hostSleeps({ sinceMs: 0, untilMs: 1, platform: 'darwin', exec: () => { throw new Error('pmset: not found'); } });
  assert.equal(broken.available, false);
  assert.equal(broken.asleepMs, null);
  assert.match(broken.why, /pmset: not found/);
});

test('A5 a live run holds an idle-sleep assertion that dies with it', () => {
  const calls = [];
  const fake = (bin, args, opts) => { calls.push({ bin, args, opts }); return { unref() {}, kill() { calls.push({ killed: true }); } }; };
  const held = keepAwake({ platform: 'darwin', spawn: fake, pid: 4242 });

  assert.equal(held.held, true);
  // MEASURED 2026-09-16: `-i` alone let a run sleep 262 s of 449 s, because the machine was in a
  // dark wake rather than awake, and an idle assertion has no idle to prevent there. `-u -t` is
  // the transition to genuinely awake; it is fired once, and `-i` holds it from then on.
  assert.deepEqual(calls[0].args, ['-u', '-t', '2'], 'the run never wakes the machine it is asserting on');
  assert.equal(calls[1].bin, 'caffeinate');
  // -i is the assertion this needs: it is idle sleep, and the maintenance sleeps that follow it,
  // that ate the pilots. -w makes the child exit with us, so a crashed suite cannot leave the
  // operator's laptop permanently awake.
  assert.deepEqual(calls[1].args, ['-i', '-m', '-w', '4242']);
  held.release();
  assert.ok(calls.some((c) => c.killed), 'release stops the assertion');
});

test('A6 no assertion is available off darwin, and the run says so instead of pretending', () => {
  const linux = keepAwake({ platform: 'linux', spawn: () => { throw new Error('should not spawn'); }, pid: 1 });
  assert.equal(linux.held, false);
  assert.match(linux.why, /linux/);
  linux.release(); // must not throw

  const missing = keepAwake({ platform: 'darwin', spawn: () => { throw new Error('ENOENT caffeinate'); }, pid: 1 });
  assert.equal(missing.held, false);
  assert.match(missing.why, /ENOENT caffeinate/);
});

test('A7 the runner takes the assertion on every live path before it spends anything', () => {
  const run = readFileSync(new URL('../evals/run.mjs', import.meta.url), 'utf8');
  const awakeAt = run.indexOf('keepAwake(');
  // The live authentication call, not the offline probe at the top of the file.
  const spendAt = run.indexOf('requireSubscription({ product: products');
  assert.ok(awakeAt > 0, 'the live path never takes a sleep assertion');
  assert.ok(awakeAt < spendAt, 'the assertion is taken before the first model call, not after');
  // Both live exits report, or the half that does not is the half that silently lies again: the
  // comparison path returns before the suite path ever runs.
  assert.equal([...run.matchAll(/^\s*reportHostSleep\(\);$/gm)].length, 2,
    'a live exit that does not report host sleep can report a contaminated number as a measurement');
  assert.match(run, /sleepBanner\(hostSleeps\(/, 'the banner is built from the power log, not from a flag');
});
