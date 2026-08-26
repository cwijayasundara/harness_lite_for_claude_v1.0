// The seam nobody tested: what a *project* receives, as opposed to what this repository has.
//
// Every defect in spec/init-delivers-skills-and-agents.md survived 118 passing tests because
// the suite only ever measured the harness inside the harness. budget.test.mjs even installs
// into a fresh repository — and then asserts that the number 12 was written into a JSON file,
// never that twelve skills are reachable. Paperwork, not outcome.
//
// Everything here runs offline, needs no API key, and needs no Claude Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, cpSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { A, C, ROOT, BIN } from './_paths.mjs';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// A real installation, the way a pod member gets one: a fresh git repository, then `init`.
// Not a fixture — the whole point of this file is that a fixture cannot tell you what the
// installer actually does.
function installed(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-seam-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const r = spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `init failed: ${r.stderr}`);
  return root;
}

// Every file the installer put in the project, excluding state/, which is gitignored and holds
// run-local scratch. What is asserted here is what a pod member would commit.
function committedFiles(root) {
  const claude = path.join(root, '.claude');
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (path.relative(claude, p) !== 'state') walk(p); }
      else out.push(p);
    }
  };
  walk(claude);
  return out;
}

const MARKETPLACE = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const PLUGIN = path.join(ROOT, '.claude-plugin', 'plugin.json');

// Spec behaviour 6. The identifier a project commits is `<plugin>@<marketplace>`, assembled
// from two files that are edited at different times by different people. A rename that touches
// one and not the other produces a project whose settings name a plugin nobody publishes —
// and the failure is silent, because an unresolvable plugin is indistinguishable from one that
// simply loaded nothing.
test('the two plugin manifests agree on one name', () => {
  const market = readJson(MARKETPLACE);
  const plugin = readJson(PLUGIN);
  const entries = market.plugins ?? [];

  assert.equal(entries.length, 1, 'one plugin per marketplace: more than one makes the id ambiguous');
  assert.equal(entries[0].name, plugin.name,
    `marketplace names the plugin "${entries[0].name}" but plugin.json calls itself "${plugin.name}"`);
  assert.equal(market.name, plugin.name,
    'the marketplace and the plugin share one name, so the id is <name>@<name> and cannot drift apart');
});

// Spec behaviour 7. `plugins[].source` is resolved relative to the marketplace root, so it must
// stay repo-relative. What must NOT appear anywhere is an absolute path: a marketplace whose
// source only resolves on the author's laptop cannot be a pod's source of truth, which is
// exactly what `"path": "/Users/<author>/..."` produced before this change.
test('the marketplace resolves for someone who is not the author', () => {
  const raw = readFileSync(MARKETPLACE, 'utf8');
  assert.equal(/(^|")\/(Users|home)\//m.test(raw), false,
    'the marketplace manifest contains an absolute home path and resolves on one machine only');
  for (const entry of readJson(MARKETPLACE).plugins ?? []) {
    assert.ok(entry.source.startsWith('./'),
      `plugin source "${entry.source}" must be relative to the marketplace root`);
  }
});

// Spec behaviour 8. README.md:24 told every pod member to clone a repository that does not
// exist, and the marketplace they were told to add was named for a directory on one laptop.
// An install instruction that names something unreachable fails at the first command.
test('every install instruction in the README names something that exists', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const repo = origin.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '');
  const name = readJson(PLUGIN).name;

  for (const [, url] of readme.matchAll(/github\.com[/:]([\w.\-]+\/[\w.\-]+?)(?:\.git)?[\s)]/g)) {
    assert.equal(url, repo, `README names repository "${url}", but origin is "${repo}"`);
  }
  // A plugin id is the token carrying the `@`. Flags and their values are not ids, so an
  // example that shows only `--scope project` contributes none and asserts nothing.
  const installed = [...readme.matchAll(/claude plugin install\s+([^\n`]+)/g)]
    .flatMap(([, rest]) => rest.trim().split(/\s+/).filter((a) => a.includes('@')));
  for (const id of installed) {
    assert.equal(id, `${name}@${name}`, `README installs "${id}", which no manifest declares`);
  }
  assert.ok(installed.length, 'the README must show the install command at least once');
  for (const [, src] of readme.matchAll(/claude plugin marketplace add\s+(\S+)/g)) {
    assert.ok(!src.startsWith('~') && !src.startsWith('/'),
      `README adds the marketplace from "${src}" — a path that exists only on one machine`);
    assert.equal(src.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, ''), repo,
      `README adds marketplace "${src}", which is not this repository`);
  }
});

// Spec behaviour 1. The harness is a shared dependency, not a copy. `init` used to place the
// sensors under .claude/runtime/ and the guides nowhere at all, which is how a project ended
// up running every check with no guide loaded and no way to notice.
test('init leaves no copy of the harness in the project', (t) => {
  const root = installed(t);
  for (const dir of ['runtime', 'lib', 'checks', 'hooks', 'skills', 'agents', 'templates']) {
    assert.equal(existsSync(path.join(root, '.claude', dir)), false,
      `.claude/${dir}/ is a copy of the harness inside the project — it can drift from the version the pod agreed on`);
  }
});

// Spec behaviour 2. The project declares which harness it uses; it does not wire hooks itself.
// Declaring hooks here as well as in the plugin is what made every binding fire twice.
test('init writes a declaration, and declares no hooks of its own', (t) => {
  const root = installed(t);
  const settings = readJson(path.join(root, '.claude', 'settings.json'));
  const name = readJson(path.join(ROOT, '.claude-plugin', 'plugin.json')).name;

  assert.equal('hooks' in settings, false,
    'the project declares hooks as well as the plugin, so every binding fires twice');
  const enabled = Object.entries(settings.enabledPlugins ?? {}).filter(([, on]) => on === true);
  assert.deepEqual(enabled.map(([id]) => id), [`${name}@${name}`],
    'exactly one plugin is enabled, and its id is the one the manifests declare');
});

// Spec behaviour 3. README tells the user to commit .claude/. Anything machine-specific in
// there is inert for every teammate and in CI — and hooks fail open, so nobody finds out.
test('nothing init writes is specific to the machine that ran it', (t) => {
  const root = installed(t);
  const real = statSync(root) && path.resolve(root);
  for (const file of committedFiles(root)) {
    const body = readFileSync(file, 'utf8');
    assert.equal(body.includes(real), false,
      `${path.relative(root, file)} contains the absolute path of the installing machine`);
    assert.equal(/(^|["\s])\/(Users|home)\//m.test(body), false,
      `${path.relative(root, file)} contains an absolute home path`);
  }
});

// Spec behaviour 10. This repository is the harness *and* a project governed by it, and its
// .claude/ is also the plugin root — so a maintainer who has the plugin installed would load
// every guide twice and fire every binding twice. Observed live while measuring the install
// mechanism during the intent. It keeps its own wiring, so an edit to a sensor takes effect on
// the next turn rather than after a plugin reinstall, and disables the published plugin here.
test('this repository consumes its own harness exactly once', () => {
  const settings = readJson(path.join(C, 'settings.json'));
  const name = readJson(PLUGIN).name;

  assert.equal(settings.enabledPlugins?.[`${name}@${name}`], false,
    'the published plugin must be disabled here, or the harness loads twice in its own repository');
  assert.ok(settings.hooks, 'this repository wires its own hooks: it is the harness');
  const wiring = JSON.stringify(settings.hooks);
  assert.equal(/\/(Users|home)\//.test(wiring), false,
    'the hook commands name one machine, so they are inert in every other clone and in CI');
  assert.match(wiring, /\$\{CLAUDE_PROJECT_DIR\}/,
    'hook commands resolve through ${CLAUDE_PROJECT_DIR} so any clone runs them');
});

// Spec behaviour 13. The banner is the first instruction the harness gives itself every
// session, and here it printed `bash .aidlc/bin/harness`, which in this repository is a shell
// syntax error — the file is JavaScript, not a shim. A control that tells you to run something
// that cannot run is worse than no control: it teaches people to ignore the banner.
test('the command the banner prints is the command that runs here', () => {
  const r = spawnSync(process.execPath, [BIN, 'hook', 'session-start'],
    { cwd: ROOT, encoding: 'utf8', input: JSON.stringify({ cwd: ROOT }) });
  assert.equal(r.status, 0, r.stderr);
  const banner = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  const [, printed] = banner.match(/^check:\s+(.+)$/m) ?? [];
  assert.ok(printed, `the banner has no check line:\n${banner}`);

  const ran = spawnSync('bash', ['-c', `${printed} --json`], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(ran.status, 2, `the banner prints a command that cannot run here: ${printed}\n${ran.stderr}`);
});

// Spec behaviour 4. The record is what lets CI fetch the same harness the laptop installed, and
// what lets the budget count guides that are deliberately not in the project. `unknown` rather
// than a missing field: a value the record could not fill must not read as an empty one.
test('the install record names the marketplace, the plugin and the commit', (t) => {
  const root = installed(t);
  const rec = readJson(path.join(root, '.aidlc', 'harness-install.json'));
  const name = readJson(PLUGIN).name;

  assert.equal(rec.marketplace, name);
  assert.equal(rec.plugin, name);
  assert.ok(rec.version, 'version is what the plugin cache directory is named after');
  assert.ok(/^[0-9a-f]{40}$|^unknown$/.test(rec.commit ?? ''),
    `commit is "${rec.commit}" — expected a full sha, or the literal "unknown" when the harness is not a checkout`);
});

// Spec behaviour 5. README says `init` is safe to re-run, and upgrading the harness is supposed
// to be exactly that. Re-running must not silently discard the one file the user hand-edits.
test('re-running init leaves the hand-edited files untouched', (t) => {
  const root = installed(t);
  const hand = [path.join(root, '.aidlc', 'harness.toml'), path.join(root, '.aidlc', 'instructions.md')];
  const before = hand.map((f) => readFileSync(f, 'utf8'));

  const again = spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' });
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(hand.map((f) => readFileSync(f, 'utf8')), before,
    're-running init overwrote a file the user edits by hand');
});

// Spec behaviours 11 and 12. The shim is the one command a human and CI both type. It cannot
// import from the harness — finding the harness is its job — so its resolution order is the only
// thing standing between a pod member and a silent no-op.
//
// Written after the resolver rather than before it: these are regression guards, not the tests
// that drove the design. Recorded here so the distinction is not lost.
test('the shim resolves the harness from HARNESS_HOME and from the plugin cache', (t) => {
  const root = installed(t);
  const shim = path.join(root, '.aidlc', 'bin', 'harness');
  const rec = readJson(path.join(root, '.aidlc', 'harness-install.json'));
  const home = mkdtempSync(path.join(tmpdir(), 'harness-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const viaEnv = spawnSync('bash', [shim, 'doctor'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home, HARNESS_HOME: A } });
  assert.equal(viaEnv.status, 0, `HARNESS_HOME did not resolve: ${viaEnv.stderr}`);

  // A plugin cache is <marketplace>/<plugin>/<version>, holding the harness at its root.
  cpSync(ROOT, path.join(home, '.claude', 'plugins', 'cache', rec.marketplace, rec.plugin, rec.version), { recursive: true });
  const viaCache = spawnSync('bash', [shim, 'doctor'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home, HARNESS_HOME: '' } });
  assert.equal(viaCache.status, 0, `the plugin cache did not resolve: ${viaCache.stderr}`);
});

test('the shim fails loudly when the harness is nowhere', (t) => {
  const root = installed(t);
  const home = mkdtempSync(path.join(tmpdir(), 'harness-nohome-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));

  const r = spawnSync('bash', [path.join(root, '.aidlc', 'bin', 'harness'), 'doctor'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home, HARNESS_HOME: '' } });

  assert.notEqual(r.status, 0, 'a shim that cannot find the harness must not exit 0');
  assert.match(r.stderr, /claude plugin marketplace add/, 'the failure names the first setup command');
  assert.match(r.stderr, /claude plugin install/, 'the failure names the second setup command');

  // A HARNESS_HOME that points nowhere is a mistyped CI variable, not a reason to hand the
  // operator a module-loader stack trace. Behaviour 12 asks for the two commands every time.
  const wrong = spawnSync('bash', [path.join(root, '.aidlc', 'bin', 'harness'), 'doctor'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home, HARNESS_HOME: path.join(home, 'nope') } });
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /HARNESS_HOME=.*holds no \.aidlc\/bin\/harness/, 'the failure says which variable is wrong');
  assert.match(wrong.stderr, /claude plugin marketplace add/, 'and still names the way out');
});

// Spec behaviour 1, on the upgrade path rather than a fresh install. The one project installed
// by the previous harness carries .claude/runtime/ — the copy this change removes. Re-running
// `init` is how the README says to upgrade, so it is where the copy has to go; a stale runtime
// is the most dangerous kind of drift, because the project still looks correctly installed.
test('upgrading removes a runtime left by an older harness', (t) => {
  const root = installed(t);
  const stale = path.join(root, '.claude', 'runtime', 'lib');
  mkdirSync(stale, { recursive: true });
  writeFileSync(path.join(stale, 'config.mjs'), '// left by an older install\n');

  const again = spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(existsSync(path.join(root, '.claude', 'runtime')), false,
    'init left a copy of an older harness in the project');
});
