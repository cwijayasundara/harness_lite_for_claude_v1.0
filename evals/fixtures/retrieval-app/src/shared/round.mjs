// Cents are integers everywhere in this app; nothing below rounds twice.
export function roundCents(value) {
  if (!Number.isFinite(value)) throw new Error('roundCents requires a finite number');
  return Math.round(value);
}
