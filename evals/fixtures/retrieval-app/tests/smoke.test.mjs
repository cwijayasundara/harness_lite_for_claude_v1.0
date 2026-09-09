import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the modules load and the two format functions are distinct', async () => {
  const invoices = await import('../src/billing/invoices.mjs');
  const summary = await import('../src/reporting/summary.mjs');
  const aggregate = await import('../src/reporting/aggregate.mjs');
  assert.equal(typeof invoices.format, 'function');
  assert.equal(typeof summary.format, 'function');
  assert.notEqual(invoices.format, summary.format, 'two modules export format; they are not the same function');
  assert.equal(typeof aggregate.rollup, 'function');
});

test('monthly rollup groups by month and sums cents', async () => {
  const { rollup } = await import('../src/reporting/aggregate.mjs');
  const rows = rollup([
    { isoDate: '2026-01-04', amountCents: 1000 },
    { isoDate: '2026-01-20', amountCents: 500 },
    { isoDate: '2026-02-02', amountCents: 250 },
  ]);
  assert.deepEqual(rows, [
    { period: '2026-01', count: 2, totalCents: 1500 },
    { period: '2026-02', count: 1, totalCents: 250 },
  ]);
});
