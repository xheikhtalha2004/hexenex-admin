import {
  CompanySettingsForTemplate,
  documentShell,
  esc,
  formatDate,
  formatMoney,
  customTableHtml,
  TableColumn,
  Money,
  totalsHtml,
} from './document-shell';

interface SalesInvoiceItemForTemplate {
  product: { name: string };
  quantity: Money;
  rate: Money;
  amount: Money;
}

interface SalesInvoiceForTemplate {
  invoiceNumber: string;
  invoiceDate: string | Date;
  status: string;
  termsText?: string | null;
  deliveryTerms?: string | null;
  deliveryAddress?: string | null;
  subtotal: Money;
  discountAmount: Money;
  totalAmount: Money;
  customer: { name: string };
  location: { name: string };
  items: SalesInvoiceItemForTemplate[];
}

export function salesInvoiceHtml(
  invoice: SalesInvoiceForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'SN', align: 'center' as const },
    { header: 'Product' },
    { header: 'Qty (sq ft)', align: 'right' as const },
    { header: 'Rate', align: 'right' as const },
    { header: 'Amount', align: 'right' as const },
  ];

  const rows = invoice.items.map((item, i) => [
    String(i + 1),
    esc(item.product.name),
    formatMoney(item.quantity),
    formatMoney(item.rate),
    formatMoney(item.amount),
  ]);

  const notes = [
    invoice.termsText ? { heading: 'Terms', value: invoice.termsText } : null,
    invoice.deliveryTerms
      ? { heading: 'Delivery Terms', value: invoice.deliveryTerms }
      : null,
    invoice.deliveryAddress
      ? { heading: 'Delivery Address', value: invoice.deliveryAddress }
      : null,
  ].filter(Boolean) as { heading: string; value: string }[];

  const bodyHtml = `
    <div class="section-label">Items</div>
    ${customTableHtml(columns, rows)}
    ${totalsHtml([
      { label: 'Subtotal', value: invoice.subtotal, emphasis: 'muted' },
      { label: 'Discount', value: invoice.discountAmount, emphasis: 'muted' },
      { label: 'Total', value: invoice.totalAmount, emphasis: 'grand' },
    ])}
    ${
      notes.length
        ? `<div class="notes">${notes.map((n) => `<div class="block"><div class="heading">${esc(n.heading)}</div><div>${esc(n.value)}</div></div>`).join('')}</div>`
        : ''
    }
  `;

  return documentShell({
    company,
    title: 'Sales Invoice',
    documentNumber: invoice.invoiceNumber,
    meta: [
      { label: 'Date', value: formatDate(invoice.invoiceDate) },
      { label: 'Customer', value: invoice.customer.name },
      { label: 'Location', value: invoice.location.name },
    ],
    bodyHtml,
    signOff: ['Prepared By', 'Received By'],
  });
}

/** A delivery note derived from the same invoice, omitting pricing — SIN-04's "Delivery Order"
 * document. No separate DB entity: this is a print-time view over the finalized invoice. */
export function deliveryOrderHtml(
  invoice: SalesInvoiceForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'SN', align: 'center' as const },
    { header: 'Product' },
    { header: 'Qty (sq ft)', align: 'right' as const },
  ];

  const rows = invoice.items.map((item, i) => [
    String(i + 1),
    esc(item.product.name),
    formatMoney(item.quantity),
  ]);

  const bodyHtml = `
    <div class="section-label">Items for Delivery</div>
    ${customTableHtml(columns, rows)}
  `;

  return documentShell({
    company,
    title: 'Delivery Order',
    documentNumber: invoice.invoiceNumber,
    meta: [
      { label: 'Date', value: formatDate(invoice.invoiceDate) },
      { label: 'Customer', value: invoice.customer.name },
      { label: 'Dispatch Location', value: invoice.location.name },
      ...(invoice.deliveryAddress
        ? [{ label: 'Delivery Address', value: invoice.deliveryAddress }]
        : []),
    ],
    bodyHtml,
    signOff: ['Dispatched By', 'Received By (Customer)'],
  });
}
