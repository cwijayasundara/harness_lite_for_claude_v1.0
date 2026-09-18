import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDS, readOptionalEvidence, validateOptionalEvidence, verifyObservedEvidence } from '../evals/lib/optional-evidence.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('every bulky optional module has one isolated experiment and an explicit decision', () => {
  const record = readOptionalEvidence(ROOT);
  assert.deepEqual(validateOptionalEvidence(ROOT, record), []);
  assert.deepEqual(record.modules.map((module) => module.id), IDS);
  assert.ok(record.modules.every((module) => module.control !== module.treatment));
});

test('optional-module decisions remain bound to the retained raw evidence', () => {
  const record = readOptionalEvidence(ROOT);
  assert.deepEqual(verifyObservedEvidence(ROOT, record), []);
});

test('no inconclusive or deterministic-only result promotes a bulky module to the default', () => {
  const record = readOptionalEvidence(ROOT);
  assert.ok(record.modules.every((module) => module.decision !== 'retain-default'));
  assert.equal(record.modules.find((module) => module.id === 'continuous-live-evals').decision,
    'do-not-ship-continuously');
});
