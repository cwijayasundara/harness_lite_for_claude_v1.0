// Late-fee calculation for an invoice paid after its due date. Amounts are integer cents.
export const GRACE_DAYS = 3; // an invoice paid within this many days of its due date owes nothing
export const DAILY_RATE_CENTS = 25;
export const MAX_FEE_CENTS = 1500;

export function daysLate(dueDate, paidDate) {
  const ms = new Date(paidDate) - new Date(dueDate);
  return Math.max(0, Math.floor(ms / 86400000));
}

export function lateFeeCents(dueDate, paidDate) {
  const late = daysLate(dueDate, paidDate);
  if (late === 0) return 0;
  if (late < GRACE_DAYS) return 0;
  const billable = late - GRACE_DAYS + 1;
  return Math.min(billable * DAILY_RATE_CENTS, MAX_FEE_CENTS);
}
