// The dress rehearsal.
//
// Runs the entire eval suite against a stub that reads the prompt and does nothing, with no
// key and no spend. It asserts two things the real suite cannot check about itself:
//
//   1. Every task RUNS — no crash, no unknown assertion, no missing fixture.
//   2. NO task passes. A task a do-nothing model satisfies is a task with no assertions in it,
//      and it will report green forever while measuring nothing. Four of the original twenty
//      were exactly that, and only running them this way revealed it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTasks, runSuite } from '../evals/run.mjs';
import { claudeInvoker } from '../evals/lib/invoker.mjs';

const C = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('no eval task is satisfied by a model that does nothing', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'donothing-'));
  writeFileSync(path.join(dir, 'claude'),
    '#!/usr/bin/env bash\necho \'{"result":"I read the repository and made no changes.","total_cost_usd":0.001,"usage":{"output_tokens":12}}\'\n');
  chmodSync(path.join(dir, 'claude'), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${dir}:${previous}`;
  try {
    // repeats are collapsed to 1: this measures the tasks, not variance.
    const tasks = loadTasks().map((x) => ({ ...x, repeats: 1, timeoutMs: 20000 }));
    const out = await runSuite({
      tasks, invoke: claudeInvoker({ pluginDir: C }),
      fixturesDir: path.join(C, 'evals', 'fixtures'), harnessBin: path.join(C, 'bin', 'harness'),
    });

    const broken = [];
    for (const r of out.results) {
      for (const run of r.runs) for (const a of run.assertions) {
        if (/assertion threw|unknown assertion|no fixture/.test(a.detail ?? '')) broken.push(`${r.id}: ${a.name} — ${a.detail}`);
      }
    }
    assert.deepEqual(broken, [], 'these tasks cannot run at all');

    const vacuous = out.results.filter((r) => r.verdict === 'pass').map((r) => r.id);
    assert.deepEqual(vacuous, [],
      `passed by a do-nothing model, so they assert nothing: ${vacuous.join(', ')}. ` +
      'Add an assertion only a model that did the work can satisfy.');
  } finally { process.env.PATH = previous; rmSync(dir, { recursive: true, force: true }); }
});
