// Staging: _base, then the fixture on top, then a pristine snapshot to diff against.
// The work copy is a real git repo, because scope-drift and the commit stage read the diff.
import { cpSync, mkdtempSync, existsSync, rmSync, mkdirSync, chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectChange } from '../../.aidlc/lib/artifacts.mjs';

// `--test-timeout` bounds a test that hangs; it does not bound a test that FAILS while leaving a
// listening socket open, because the failure is instant and it is the file's process that then
// refuses to exit. Without `--test-force-exit` such a seeded defect converts a reported failure
// into an outer invocation timeout, which is the one outcome the leaked-server trial forbids.
export const PRODUCT_TEST_ARGS = ['--test', '--test-timeout=10000'];
export const PRODUCT_TEST_COMMAND = `node ${PRODUCT_TEST_ARGS.join(' ')}`;
// Process mode only, and deliberately NOT added to the shared constant above: the spec's Design
// says the container path is unchanged in behaviour, and PRODUCT_TEST_ARGS is what the container
// path runs. A container gets a fresh PID namespace and `--rm`, so a leaked socket dies with it;
// a host child does not, and `--test-timeout` does not help — it bounds a test that HANGS, while
// this one FAILS instantly and it is the file's process that then refuses to exit. Measured
// before this flag existed: the seeded leaked-server case returned ETIMEDOUT after 25,009ms
// instead of the failure it was supposed to report.
export const productTestArgs = [...PRODUCT_TEST_ARGS, '--test-force-exit'];
export const productTestCommand = `node ${productTestArgs.join(' ')}`;

export const FIXTURES = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'fixtures');

export function stage(fixturesDir, name, { product = false, native = false } = {}) {
  const base = path.join(fixturesDir, '_base');
  const fx = path.join(fixturesDir, name);
  if (!existsSync(fx)) throw new Error(`no fixture "${name}" in ${fixturesDir}`);
  const root = mkdtempSync(path.join(tmpdir(), `eval-${name}-`));
  const work = path.join(root, 'work');
  const pristine = path.join(root, 'pristine');
  if(product){mkdirSync(path.join(work,'.aidlc'),{recursive:true});for(const rel of ['.gitignore','.aidlc/.gitignore'])cpSync(path.join(base,rel),path.join(work,rel));}
  else cpSync(base, work, { recursive: true });
  cpSync(fx, work, { recursive: true });
  rmSync(path.join(work, 'README.md'), { force: true });
  // Failed generated HTTP tests may leak listening servers. Bound the existing check inside
  // disposable product trials so a seeded defect cannot consume an entire planning turn.
  if(product){
    const config=path.join(work,'.aidlc/harness.toml');
    if(existsSync(config))writeFileSync(config,readFileSync(config,'utf8').replace(/(^test\s*=\s*")node --test(?=[" ])/m,`$1${productTestCommand}`));
  }
  // Install through the real boundary. Hand-building only the shim omitted the inventory record
  // after Phase 1B, so the budget correctly failed every model task on an unaccounted surface.
  const realBin = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), '.aidlc', 'bin', 'harness');
  if (native) {
    rmSync(path.join(work, '.aidlc'), {recursive:true, force:true});
    writeFileSync(path.join(work, 'CLAUDE.md'), `Use existing code patterns and meaningful regression tests. Run ${PRODUCT_TEST_COMMAND}. Use rg and bounded source reads for navigation. Preserve public compatibility except explicit requirement changes. Ask about consequential ambiguity; routine implementation choices are yours. Follow the external driver’s current approval decision. No dependencies or remote deployment.\n`);
  }
  const installed = native ? {status:0} : spawnSync(process.execPath, [realBin, 'init', '--into', work], { cwd: work, encoding: 'utf8' });
  if (installed.status !== 0) throw new Error(`fixture harness install failed: ${installed.stderr || installed.stdout}`);

  const git = (...a) => spawnSync('git', a, { cwd: work, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'eval@harness');
  git('config', 'user.name', 'eval');
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  // This existing fixture represents execution of this named change, not backlog inference.
  if (!native && name === 'contract-planned') selectChange({ layout: { root: work, artifacts: path.join(work, '.aidlc/artifacts') } }, 'hyphen-titlecase');
  // The baseline compares source bytes, not repository internals. Copying .git adds mutable
  // object/maintenance state and produced intermittent copy failures on the hosted runner.
  cpSync(work, pristine, { recursive: true, filter: source => path.basename(source) !== '.git' });
  return { root, work, pristine, native, harnessBin: realBin, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// A host child process — never a sandbox, and never called one. It inherits the cleanup
// discipline of the container runtime this harness used to run product trials in: a
// timed-out or errored run's whole process group is killed, not just the direct child, so a
// script that itself forked children cannot leak one. Ports are claimed the same way a real
// server binds one — by asking the OS for port 0 and reading back what it assigned, never by
// picking a constant.
export function claimPort() {
  const probe = "const s=require('net').createServer();s.listen(0,()=>{process.stdout.write(String(s.address().port));s.close(()=>process.exit(0));});";
  const r = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 5000 });
  const port = Number((r.stdout || '').trim());
  if (!port) throw new Error(`failed to claim an ephemeral port: ${r.stderr || r.stdout || r.error?.message}`);
  return port;
}

// `node --test` marks its children with NODE_TEST_CONTEXT so they report over IPC instead of
// exiting on their own verdict. A product check spawned from inside the suite inherits that mark,
// and the product's own `node --test` then reports a real failure as exit 0 — a failing product
// silently graded as passing. The container runtime this replaced never forwarded the variable,
// because only explicitly passed environment crossed that boundary, which is why the defect
// appeared only once trials ran as host processes. It must be cleared deliberately: inheriting
// the parent environment is exactly what makes it unsafe.
const PRODUCT_ENV_STRIP = ['NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID'];
function productEnv(env) {
  const merged = { ...process.env, ...env };
  for (const key of PRODUCT_ENV_STRIP) delete merged[key];
  return merged;
}

export function execNode(cwd, nodeArgs, { input, timeout = 15000, env } = {}) {
  const r = spawnSync(process.execPath, nodeArgs, {
    cwd, input, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
    detached: true, env: productEnv(env),
  });
  // Only the routes where WE killed the child. Review finding 4 asked for a reap on the success
  // route too; that is unsafe and useless here, and the measurement says so. Useless: after a
  // clean exit the child is gone and any descendant it left has been reparented to init, so a
  // ppid walk from its pid finds nothing. Unsafe: pids are recycled, so walking a dead pid can
  // name a live unrelated process's children and kill them. It also put a `ps` on every ledger
  // and service call — `--stage stop` went from 66s to past 600s. B1's "teardown on success, on
  // assertion failure and on timeout" is the STAGE teardown, which the tests run in `finally`;
  // the orphan reap is B4, and B4 is about the timeout.
  if ((r.error || r.signal) && r.pid) killProcessGroup(r.pid);
  return r;
}

export function spawnDetachedProcess(cwd, nodeArgs, env = {}) {
  const child = spawn(process.execPath, nodeArgs, { cwd, detached: true, stdio: 'ignore', env: productEnv(env) });
  child.unref();
  return child;
}

// `spawn({detached:true})` makes a session leader, so -pid names a real group. spawnSync does NOT,
// so `process.kill(-pid)` had no group to reach and the catch below swallowed the failure in
// silence: a seeded grandchild survived every timeout. The product's `node --test` runs one
// process per test file, so the grandchild is exactly what leaks. Walk the actual parent/child
// table instead — `ps` is on macOS and Linux alike and costs nothing, and the group kill stays as
// the cheap first attempt for the callers that did spawn a leader.
export function killProcessGroup(pid) {
  if (!pid) return;
  // `detached` does make the child a group leader (measured: pid == pgid), but once spawnSync's
  // own SIGKILL has reaped the leader, `process.kill(-pid)` no longer reaches the survivors —
  // measured directly: child dead, grandchild alive. The grandchild is what matters, because the
  // product's `node --test` runs one process per test file.
  //
  // So resolve the group explicitly. Membership is by PGID, never by PPID: a dead pid's children
  // are reparented to init, and pids are recycled, so a ppid walk can name a live unrelated
  // process's children — which is exactly what happened, killing processes belonging to tests
  // running concurrently and turning a 400ms test into a 123s failure. A pgid equal to our
  // child's pid belongs to our child's group and to nothing else while that group exists.
  try { process.kill(-pid, 'SIGKILL'); } catch { /* leader already reaped; the group walk follows */ }
  // A reuse window remains and cannot be closed from here: between spawnSync reaping the child
  // and `ps` running, the kernel may recycle that pid onto a new group leader, whose pgid would
  // match. It is narrow, and narrower than the PPID walk it replaced, but it is not zero.
  const table = spawnSync('ps', ['-Ao', 'pid=,pgid='], { encoding: 'utf8', timeout: 5000 });
  // Never degrade quietly back to the group kill that was measured insufficient: a reaper that
  // cannot enumerate is a reaper that reports success while leaving the product test running,
  // which is the defect class this change exists to remove.
  if (table.status !== 0 || !table.stdout) {
    throw new Error(`cannot reap process group ${pid}: ps is unavailable (${table.error?.message ?? table.stderr ?? `exit ${table.status}`})`);
  }
  for (const line of table.stdout.split('\n')) {
    const [member, group] = line.trim().split(/\s+/).map(Number);
    if (group === pid && member && member !== process.pid) {
      try { process.kill(member, 'SIGKILL'); } catch { /* already gone */ }
    }
  }
}

export function isolateStage(s, pluginRoot) {
  s.plugin = path.join(s.root, 'plugin');
  s.home = path.join(s.root, 'session');
  s.data = path.join(s.root, 'data');
  for (const dir of [s.plugin, s.home, s.data, ...(s.native ? [] : [path.join(s.work, '.aidlc/state'), path.join(s.work, '.aidlc/artifacts')])]) mkdirSync(dir, { recursive: true });
  for (const rel of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', ...['bin', 'lib', 'checks', 'sensors', 'skills', 'roles', 'templates', 'hooks', 'adapters', 'policies', 'instructions.md'].map(p => `.aidlc/${p}`)]) {
    const target = path.join(s.plugin, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(pluginRoot, rel), target, { recursive: true });
  }
  // Rootless container UIDs match the host; root-run CI uses an unprivileged fallback UID.
  if (process.getuid?.() === 0) {
    const writable = dir => { chmodSync(dir, 0o777); for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name); if (e.isDirectory()) writable(p); else chmodSync(p, 0o666);
    } };
    for (const dir of [s.work, s.home, s.data]) writable(dir);
  }
  return s;
}


// Inspect untrusted output before the parent reads artifacts or executes Git operations.
export function assertProductTree(root) {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, e.name);
    if (e.isSymbolicLink()) throw new Error(`product output contains a symlink: ${target}`);
    if (e.isDirectory()) assertProductTree(target);
  }
}

// A fresh immutable source snapshot also avoids stale bind-mount reads after host-side edits.
// The parent never imports untrusted product modules into its assertion process.
export function runtimeSnapshot(s) {
  assertProductTree(s.work);
  const dir=mkdtempSync(path.join(s.root,'runtime-source-'));
  const work=path.join(dir,'work');
  cpSync(s.work,work,{recursive:true,filter:p=>path.basename(p)!=='.git'});
  return {...s,work,dispose:()=>rmSync(dir,{recursive:true,force:true})};
}
