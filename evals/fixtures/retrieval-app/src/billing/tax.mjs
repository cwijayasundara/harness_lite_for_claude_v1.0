import { roundCents } from '../shared/round.mjs';

const RATES = { standard: 0.2, reduced: 0.05, zero: 0 };

export function applyTax(cents, band = 'standard') {
  if (!(band in RATES)) throw new Error(`unknown tax band: ${band}`);
  return roundCents(cents * (1 + RATES[band]));
}
