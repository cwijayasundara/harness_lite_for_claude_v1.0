// The other exported `format` in this app. This one renders a report row, not money — a lookup
// that stops at the first match answers the wrong question.
export function format(row) {
  return `${row.period}\t${row.count}\t${row.totalCents}`;
}

export function render(rows) {
  return rows.map(format).join('\n');
}
