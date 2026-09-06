// A small invoicing ledger. Customers and their invoices, kept in memory for the life of the
// process. See NOTES.md for what this is and is not.
const customers = new Map();
const invoices = new Map();
let nextCustomerId = 1;
let nextInvoiceId = 1;

export function addCustomer(name) {
  const id = nextCustomerId++;
  customers.set(id, { id, name });
  return id;
}

export function addInvoice(customerId, amountCents, dueDate) {
  if (!customers.has(customerId)) throw new Error('unknown customer');
  const id = nextInvoiceId++;
  invoices.set(id, { id, customerId, amountCents, dueDate });
  return id;
}

export function listInvoices(customerId) {
  return [...invoices.values()].filter((inv) => inv.customerId === customerId);
}
