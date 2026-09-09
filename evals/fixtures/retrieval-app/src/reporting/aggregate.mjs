import { roundCents } from '../shared/round.mjs';

// Entries are { isoDate, amountCents }. Periods are keyed by their label.
function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

export function rollup(entries, period = 'month') {
  if (period !== 'month') throw new Error(`unsupported period: ${period}`);
  const buckets = new Map();
  for (const entry of entries) {
    const key = monthKey(entry.isoDate);
    const bucket = buckets.get(key) ?? { period: key, count: 0, totalCents: 0 };
    bucket.count += 1;
    bucket.totalCents = roundCents(bucket.totalCents + entry.amountCents);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
}
