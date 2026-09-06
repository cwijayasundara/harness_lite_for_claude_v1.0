import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the modules load', async () => {
  const ledger = await import('../src/ledger.mjs');
  const fees = await import('../src/fees.mjs');
  assert.equal(typeof ledger.addCustomer, 'function');
  assert.equal(typeof fees.lateFeeCents, 'function');
});
