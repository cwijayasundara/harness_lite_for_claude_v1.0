import { roundCents } from '../shared/round.mjs';

const invoices = [];

// One of two exported `format` functions in this app. This one renders money.
export function format(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(roundCents(cents));
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function addInvoice(id, customerId, amountCents, isoDate) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amountCents must be a positive integer');
  invoices.push({ id, customerId, amountCents, isoDate });
  return id;
}

export function listInvoices() {
  return invoices.map((i) => ({ ...i }));
}
