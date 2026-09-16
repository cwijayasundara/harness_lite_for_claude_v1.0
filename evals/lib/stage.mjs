// Staging: _base, then the fixture on top, then a pristine snapshot to diff against.
// The work copy is a real git repo, because scope-drift and the commit stage read the diff.
import { cpSync, mkdtempSync, existsSync, rmSync, mkdirSync, chmodSync, readdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectChange } from '../../.aidlc/lib/artifacts.mjs';

// The product's own test command. `calculator` is React + TypeScript on vitest, so this is no
// longer `node --test`: a product with a real toolchain runs the toolchain's runner, and the
// three `--test-force-exit` paragraphs that used to live here went with the HTTP service product
// they were written for — vitest tears its own environment down.
export const PRODUCT_TEST_COMMAND = 'npx vitest run';

// Not `execNode`: the runner is a bin in the linked `node_modules`, not a Node entry point.
export function runProductTests(cwd, { timeout = 180000 } = {}) {
  return spawnSync('npx', ['vitest', 'run'], { cwd, encoding: 'utf8', timeout, killSignal: 'SIGKILL', env: productEnv() });
}

export const FIXTURES = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'fixtures');

// G23. `gates` is the task's, not the fixture's. G06 made `[gates]` a policy defaulting to
// `advisory`, where an out-of-scope write is a warning rather than a refusal — so the two tasks
// that measure a REFUSAL silently started measuring a warning, and neither could pass again.
// `clean-app` serves both kinds of task, so pinning the mode per fixture is not available: a task
// that asserts a refusal has to say which mode it means, exactly as `test/_gates.mjs` makes the
// unit tests say it.
// A fixture with a real toolchain (the calculator is React + TypeScript + vitest + eslint +
// prettier) needs its dependencies, and copying 132 MB of `node_modules` into every staged trial —
// two arms, three repetitions, three intents — would cost more than the model calls do. One
// symlink at the staged ROOT instead: Node's resolution walks up from `work/` and finds it, the
// tree never enters `work/` so no diff, scope check or baseline can see it, and the agent's writes
// land in `work/` rather than in the fixture everyone else stages from.
//
// Not installed here on purpose. An install inside a measured trial is network, minutes and a
// lockfile resolution that could differ between the two arms being compared.
export function linkDependencies(fixtureDir, root) {
  // Absolute: a relative target resolves against the SYMLINK's directory, which is a tmpdir, so
  // `evals/fixtures/calculator/node_modules` dangled silently and every verb fell back to npx's
  // registry path.
  const modules = path.resolve(fixtureDir, 'node_modules');
  if (!existsSync(path.join(fixtureDir, 'package.json'))) return null;
  if (!existsSync(modules)) {
    throw new Error(`${path.basename(fixtureDir)} declares dependencies but has no node_modules — `
      + `run: npm ci --prefix ${path.relative(process.cwd(), fixtureDir) || fixtureDir}`);
  }
  const link = path.join(root, 'node_modules');
  symlinkSync(modules, link, 'dir');
  return link;
}

export function stage(fixturesDir, name, { product = false, native = false, gates = null } = {}) {
  const base = path.join(fixturesDir, '_base');
  const fx = path.join(fixturesDir, name);
  if (!existsSync(fx)) throw new Error(`no fixture "${name}" in ${fixturesDir}`);
  const root = mkdtempSync(path.join(tmpdir(), `eval-${name}-`));
  // A staged fixture is a few hundred files that exist for a minute and are then deleted, and it
  // is created twenty-two times a run. MEASURED 2026-09-13: Spotlight's `mds_stores` hit 172% CPU
  // indexing that churn while a suite ran, and the whole machine went to load 12. `.metadata_never_index`
  // at the root of a directory is the documented way to tell Spotlight not to, it needs no
  // permissions, and nothing here is ever searched for. The antivirus half of the same storm needs
  // an operator exclusion — see evals/README.md.
  writeFileSync(path.join(root, '.metadata_never_index'), '');
  const work = path.join(root, 'work');
  const pristine = path.join(root, 'pristine');
  linkDependencies(fx, root);
  if(product){mkdirSync(path.join(work,'.aidlc'),{recursive:true});for(const rel of ['.gitignore','.aidlc/.gitignore'])cpSync(path.join(base,rel),path.join(work,rel));}
  else cpSync(base, work, { recursive: true });
  // Never the dependency tree: it is gitignored, so `git` cannot see it, but `cpSync` copies what
  // is on disk. MEASURED: staging went from ~200 ms to 35 s, and `assertProductTree` then walked
  // 10,000 files looking for symlinks. `linkDependencies` put it at the staged root instead.
  cpSync(fx, work, { recursive: true, filter: (src) => path.basename(src) !== 'node_modules' });
  rmSync(path.join(work, 'README.md'), { force: true });
  // Install through the real boundary. Hand-building only the shim omitted the inventory record
  // after Phase 1B, so the budget correctly failed every model task on an unaccounted surface.
  const realBin = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), '.aidlc', 'bin', 'harness');
  if (native) {
    rmSync(path.join(work, '.aidlc'), {recursive:true, force:true});
    // The native arm's whole steering. It names the same checks the harness arm reads out of the
    // detected `harness.toml`, because an arm that did not know how to run the type checker would
    // be losing to a worse harness rather than to a better one.
    writeFileSync(path.join(work, 'CLAUDE.md'), `Use existing code patterns and meaningful regression tests. Checks: ${PRODUCT_TEST_COMMAND}, npx tsc --noEmit, npx eslint ., npx prettier --check . — all four must pass before you report done. Use rg and bounded source reads for navigation. Preserve public compatibility except explicit requirement changes. Ask about consequential ambiguity; routine implementation choices are yours. Follow the external driver’s current approval decision. Add no new dependencies, and do not deploy.\n`);
  }
  const installed = native ? {status:0} : spawnSync(process.execPath, [realBin, 'init', '--into', work], { cwd: work, encoding: 'utf8' });
  if (installed.status !== 0) throw new Error(`fixture harness install failed: ${installed.stderr || installed.stdout}`);

  if (gates) {
    const config = path.join(work, '.aidlc/harness.toml');
    if (existsSync(config)) {
      writeFileSync(config, `${readFileSync(config, 'utf8').trimEnd()}\n\n`
        + `# Pinned by the task under test: it measures what this mode does.\n[gates]\n`
        + `spec  = "${gates}"\nplan  = "${gates}"\nmerge = "human"\n`);
    }
  }
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

// `node --test` marks its children with NODE_TEST_CONTEXT so they report over IPC instead of
// exiting on their own verdict. A product check spawned from inside the suite inherits that mark,
// and the product's own `node --test` then reports a real failure as exit 0 — a failing product
// silently graded as passing. The container runtime this replaced never forwarded the variable,
// because only explicitly passed environment crossed that boundary, which is why the defect
// appeared only once trials ran as host processes. It must be cleared deliberately: inheriting
// the parent environment is exactly what makes it unsafe.
const PRODUCT_ENV_STRIP = ['NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID'];
export function productEnv(env) {
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

export function stageProduct(s, pluginRoot) {
  s.plugin = path.join(s.root, 'plugin');
  s.home = path.join(s.root, 'session');
  s.data = path.join(s.root, 'data');
  for (const dir of [s.plugin, s.home, s.data, ...(s.native ? [] : [path.join(s.work, '.aidlc/state'), path.join(s.work, '.aidlc/artifacts')])]) mkdirSync(dir, { recursive: true });
  for (const rel of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', ...['bin', 'lib', 'checks', 'sensors', 'skills', 'roles', 'templates', 'hooks', 'adapters', 'policies', 'instructions.md'].map(p => `.aidlc/${p}`)]) {
    const target = path.join(s.plugin, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(pluginRoot, rel), target, { recursive: true });
  }
  // Root-run CI leaves files the product process cannot rewrite; widen them for that case only.
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

// A fresh immutable source snapshot also avoids stale reads after host-side edits.
// The parent never imports untrusted product modules into its assertion process.
export function runtimeSnapshot(s) {
  assertProductTree(s.work);
  const dir=mkdtempSync(path.join(s.root,'runtime-source-'));
  const work=path.join(dir,'work');
  cpSync(s.work,work,{recursive:true,filter:p=>path.basename(p)!=='.git'});
  return {...s,work,dispose:()=>rmSync(dir,{recursive:true,force:true})};
}
