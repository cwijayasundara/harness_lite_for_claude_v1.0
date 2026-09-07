// Staging: _base, then the fixture on top, then a pristine snapshot to diff against.
// The work copy is a real git repo, because scope-drift and the commit stage read the diff.
import { cpSync, mkdtempSync, existsSync, rmSync, mkdirSync, chmodSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Install through the real boundary. Hand-building only the shim omitted the inventory record
  // after Phase 1B, so the budget correctly failed every model task on an unaccounted surface.
  const realBin = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), '.aidlc', 'bin', 'harness');
  if (native) {
    rmSync(path.join(work, '.aidlc'), {recursive:true, force:true});
    writeFileSync(path.join(work, 'CLAUDE.md'), 'Use existing code patterns and meaningful regression tests. Run node --test. Use rg and bounded source reads for navigation. Preserve public compatibility except explicit requirement changes. Ask about consequential ambiguity; routine implementation choices are yours. Follow the external driver’s current approval decision. No dependencies or remote deployment.\n');
  }
  const installed = native ? {status:0} : spawnSync(process.execPath, [realBin, 'init', '--into', work], { cwd: work, encoding: 'utf8' });
  if (installed.status !== 0) throw new Error(`fixture harness install failed: ${installed.stderr || installed.stdout}`);

  const git = (...a) => spawnSync('git', a, { cwd: work, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'eval@harness');
  git('config', 'user.name', 'eval');
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  // The baseline compares source bytes, not repository internals. Copying .git adds mutable
  // object/maintenance state and produced intermittent copy failures on the hosted runner.
  cpSync(work, pristine, { recursive: true, filter: source => path.basename(source) !== '.git' });
  return { root, work, pristine, native, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// Product trials mount an allowlisted plugin, never the repository containing private scenarios.
export const PRODUCT_IMAGE = 'lean-harness-product:2.1.263';
export function isolateStage(s, pluginRoot) {
  s.plugin = path.join(s.root, 'plugin');
  s.home = path.join(s.root, 'session');
  s.data = path.join(s.root, 'data');
  for (const dir of [s.plugin, s.home, s.data, ...(s.native ? [] : [path.join(s.work, '.aidlc/state'), path.join(s.work, '.aidlc/artifacts')])]) mkdirSync(dir, { recursive: true });
  for (const rel of ['.claude-plugin/plugin.json', ...['bin', 'lib', 'checks', 'sensors', 'skills', 'roles', 'templates', 'hooks', 'adapters', 'policies', 'instructions.md'].map(p => `.aidlc/${p}`)]) {
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
  s.image = process.env.HARNESS_PRODUCT_IMAGE || PRODUCT_IMAGE;
  return s;
}

export function productDockerArgs(s, { phase = 'runtime', name, network = false, detached = false, env = {} } = {}) {
  const bind = (from, to, readonly = true) => ['--mount', `type=bind,src=${from},dst=${to}${readonly ? ',readonly' : ''}`];
  const args = ['run', ...(detached ? ['-d'] : ['--rm', '-i']), ...(name ? ['--name', name] : []),
    '--init', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128',
    '--memory=1g', '--cpus=2', '--user', `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`,
    '--network', network ? 'bridge' : 'none', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m,mode=1777',
    '--env', 'GIT_CONFIG_COUNT=1', '--env', 'GIT_CONFIG_KEY_0=safe.directory', '--env', 'GIT_CONFIG_VALUE_0=/work',
    '--workdir', '/work', ...bind(s.work, '/work', phase !== 'implement')];
  if (s.native && !['runtime','review'].includes(phase)) {
    args.push(...bind(s.home,'/session',false), ...bind(path.join(s.work,'.git'),'/work/.git'), '--env','HOME=/session', '--env','HARNESS_HOME=');
    if (phase === 'characterize') args.push(...bind(path.join(s.work,'tests'),'/work/tests',false));
    for (const [key,value] of Object.entries(env)) args.push('--env',value === undefined ? key : `${key}=${value}`);
    return [...args,s.image];
  }
  if (phase === 'characterize') args.push(...bind(path.join(s.work,'tests'),'/work/tests',false));
  if (!['runtime', 'review'].includes(phase)) {
    args.push(...bind(s.plugin, '/plugin'), ...bind(s.home, '/session', false),
      ...bind(path.join(s.work, '.git'), '/work/.git'),
      ...bind(path.join(s.work, '.claude'), '/work/.claude'),
      ...bind(path.join(s.work, '.aidlc/harness.toml'), '/work/.aidlc/harness.toml'),
      ...bind(path.join(s.work, '.aidlc/state'), '/work/.aidlc/state', false),
      ...bind(path.join(s.work, '.aidlc/artifacts'), '/work/.aidlc/artifacts', phase !== 'plan'));
    args.push('--env', 'HOME=/session', '--env', 'HARNESS_HOME=/plugin/.aidlc');
  } else args.push(...bind(s.data, '/data', false), '--env', 'HOME=/tmp');
  for (const [key, value] of Object.entries(env)) args.push('--env', value === undefined ? key : `${key}=${value}`);
  return [...args, s.image];
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
