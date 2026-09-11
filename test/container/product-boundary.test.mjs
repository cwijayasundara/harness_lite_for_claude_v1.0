// Opt-in only. This file sits outside the ordinary `test/*.test.mjs` glob (.aidlc/harness.toml's
// `test` capability is not recursive), so it never runs — and never prints green — on a machine
// with no Docker. Run it explicitly with HARNESS_PRODUCT_DOCKER=1 and a real daemon:
//   HARNESS_PRODUCT_DOCKER=1 node --test test/container/*.test.mjs
//
// These three tests assert what only the container actually provides: that a real OS-level
// boundary, not merely a directory, denies reads and writes across it, and that a timed-out run
// removes the container rather than only its client. Moved verbatim from test/product-trials.test.mjs
// (the-tests-run-without-docker) — every assertion each already carried is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stage, isolateStage, productDockerArgs } from '../../evals/lib/stage.mjs';
import { runProductCheck } from '../../evals/lib/campaign.mjs';
import { ROOT } from '../_paths.mjs';
const fixtures = path.join(ROOT, 'evals/fixtures');

test('real container denies private reads and writes across planning and implementation boundaries', { skip: process.env.HARNESS_PRODUCT_DOCKER !== '1' }, () => {
  const s = isolateStage(stage(fixtures, 'campaign-ledger'), ROOT);
  try {
    const privateFile = path.join(s.root, 'private-assertions.json');
    writeFileSync(privateFile, 'private grading sentinel');
    writeFileSync(path.join(s.work, '.aidlc/artifacts/probe.md'), 'approved sentinel');
    for (const phase of ['plan', 'implement']) {
      const script = `const fs=require('fs'),assert=require('assert/strict');
        require('child_process').execFileSync('git',['rev-parse','HEAD']);
        for(const file of ${JSON.stringify([privateFile, path.join(ROOT,'evals/products.json'), '/plugin/evals/tasks.json','/var/run/docker.sock'])}) assert.throws(()=>fs.readFileSync(file));
        assert.throws(()=>fs.writeFileSync('/plugin/.claude-plugin/plugin.json','tamper'));
        assert.throws(()=>fs.writeFileSync('/work/.git/config','tamper'));
        assert.throws(()=>fs.writeFileSync('/work/.aidlc/harness.toml','tamper'));
        ${phase === 'plan' ? "assert.throws(()=>fs.writeFileSync('/work/src/ledger.mjs','tamper')); fs.writeFileSync('/work/.aidlc/artifacts/draft.md','draft');" : "assert.throws(()=>fs.writeFileSync('/work/.aidlc/artifacts/probe.md','tamper')); fs.writeFileSync('/work/src/owned.mjs','export const x=1;');"}
        console.log('boundary passed');`;
      const r = spawnSync('docker', [...productDockerArgs(s, { phase }), 'node', '-e', script], {encoding:'utf8',timeout:30000});
      assert.equal(r.status, 0, r.stderr+r.stdout);
      assert.match(r.stdout, /boundary passed/);
    }
    assert.equal(readFileSync(privateFile,'utf8'), 'private grading sentinel');
  } finally {s.cleanup();}
});

test('timed-out public product tests remove their container, not just the Docker client', { skip: process.env.HARNESS_PRODUCT_DOCKER !== '1' }, () => {
  const s = isolateStage(stage(fixtures, 'campaign-service', {product:true}), ROOT);
  const containers = () => spawnSync('docker',['ps','-aq','--filter','name=harness-check-'],{encoding:'utf8',timeout:5000}).stdout.trim();
  const before = containers();
  try {
    writeFileSync(path.join(s.work, 'tests/hang.test.mjs'), 'setInterval(()=>{},1000);\n');
    const out = runProductCheck(s, 2000);
    assert.equal(out.error?.code, 'ETIMEDOUT');
    assert.equal(containers(), before, 'a killed client must not leave the product test running');
  } finally { s.cleanup(); }
});

test('native comparison sandbox provides rg and tests while protecting planning, Git and private grading', { skip: process.env.HARNESS_PRODUCT_DOCKER !== '1' }, () => {
  const s = isolateStage(stage(fixtures, 'campaign-ledger', {product:true,native:true}), ROOT);
  try {
    const secret = path.join(s.root, 'private-grading.json'); writeFileSync(secret, 'private');
    for (const phase of ['plan','implement']) {
      const script = `const fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
        assert.throws(()=>fs.readFileSync(${JSON.stringify(secret)}));
        assert.equal(fs.existsSync('/plugin'),false);
        assert.throws(()=>fs.writeFileSync('/work/.git/config','tamper'));
        cp.execFileSync('rg',['addCustomer','src/ledger.mjs']);cp.execFileSync('node',['--test']);
        ${phase==='plan'?"assert.throws(()=>fs.writeFileSync('/work/src/ledger.mjs','tamper'));":"fs.writeFileSync('/work/src/new.mjs','export const x=1;');"}`;
      const out = spawnSync('docker', [...productDockerArgs(s, {phase}), 'node', '-e', script], {encoding:'utf8',timeout:30000});
      assert.equal(out.status, 0, out.stdout+out.stderr);
    }
  } finally { s.cleanup(); }
});
