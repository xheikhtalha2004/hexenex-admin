import {
  CompanySettingsForTemplate,
  documentShell,
  esc,
  formatDate,
  formatMoney,
  customTableHtml,
  Money,
  splitSummaryHtml,
  UNIFIED_INVOICE_STYLES,
} from './document-shell';

interface SalesInvoiceItemForTemplate {
  product: { name: string };
  quantity: Money;
  rate: Money;
  amount: Money;
  inputParameters?: unknown;
}

function displayValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '?';
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
  advanceReceived?: Money;
  previousBalance: Money;
  preparedByName: string;
  customer: { name: string };
  location: { name: string };
  items: SalesInvoiceItemForTemplate[];
}

export function salesInvoiceHtml(
  invoice: SalesInvoiceForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'Qty', align: 'center' as const },
    { header: 'Product', align: 'center' as const },
    { header: 'Width', align: 'center' as const },
    { header: 'Length', align: 'center' as const },
    { header: 'Sq Ft', align: 'center' as const },
    { header: 'Rate', align: 'center' as const },
    { header: 'Amount', align: 'center' as const },
  ];

  const rows = invoice.items.map((item) => {
    const p = item.inputParameters as Record<string, unknown> | undefined;
    const sizeOption = typeof p?.sizeOption === 'string' ? p.sizeOption : '';

    let w = '?';
    let l = '?';
    let qty = '?';
    if (sizeOption === 'SELF') {
      w = '-';
      l = '-';
      qty = '-';
    } else if (p) {
      qty = p.quantity != null ? displayValue(p.quantity) : '?';
      l = p.length != null ? displayValue(p.length) : '?';
      w =
        p.width != null
          ? displayValue(p.width)
          : sizeOption !== 'FIX'
            ? sizeOption
            : '?';
    }

    return [
      qty,
      esc(item.product.name),
      w,
      l,
      formatMoney(item.quantity),
      formatMoney(item.rate),
      formatMoney(item.amount),
    ];
  });

  const totalSquareFeet = invoice.items.reduce(
    (sum, item) => sum + Number(item.quantity),
    0,
  );
  const grossTotal = Number(invoice.totalAmount);
  const previousBalance = Math.max(0, Number(invoice.previousBalance ?? 0));
  const totalAmount = previousBalance + grossTotal;
  const received = Number(invoice.advanceReceived ?? 0);
  const balance = Math.max(0, totalAmount - received);

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
    ${splitSummaryHtml('T. Sq. Ft.', totalSquareFeet, [
      { label: 'Gross Total', value: grossTotal, emphasis: 'muted' },
      { label: 'Previous Balance', value: previousBalance, emphasis: 'muted' },
      { label: 'Total Amount', value: totalAmount },
      { label: 'Received', value: received, emphasis: 'muted' },
      ...(balance > 0
        ? [{ label: 'Balance', value: balance, emphasis: 'grand' as const }]
        : []),
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
    titleMeta: [{ label: 'Date', value: formatDate(invoice.invoiceDate) }],
    meta: [{ label: 'Customer', value: invoice.customer.name }],
    bodyHtml,
    footerLeft: `Prepared by: ${invoice.preparedByName}`,
    extraStyles: UNIFIED_INVOICE_STYLES,
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
    { header: 'Product & Description' },
    { header: 'Size' },
    { header: 'Qty', align: 'right' as const },
    { header: 'Width', align: 'right' as const },
    { header: 'Length', align: 'right' as const },
    { header: 'Sq Ft', align: 'right' as const },
  ];

  const rows = invoice.items.map((item, i) => {
    const p = item.inputParameters as Record<string, unknown> | undefined;
    const sizeOption = typeof p?.sizeOption === 'string' ? p.sizeOption : '';
    const desc = p && typeof p.description === 'string' ? p.description : '';
    const productCol = desc
      ? `${esc(item.product.name)}<br/><span style="font-size:8.5px;color:#555;">${esc(desc)}</span>`
      : esc(item.product.name);

    let w = '?';
    let l = '?';
    let qty = '?';
    if (sizeOption === 'SELF') {
      w = '-';
      l = '-';
      qty = '-';
    } else if (p) {
      qty = p.quantity != null ? displayValue(p.quantity) : '?';
      l = p.length != null ? displayValue(p.length) : '?';
      w =
        p.width != null
          ? displayValue(p.width)
          : sizeOption !== 'FIX'
            ? sizeOption
            : '?';
    }

    return [
      String(i + 1),
      productCol,
      esc(
        sizeOption === 'FIX'
          ? 'Fix (custom width)'
          : sizeOption === 'SELF'
            ? 'Self (entered sqft directly)'
            : sizeOption
              ? sizeOption + ' (standard)'
              : '—',
      ),
      qty,
      w,
      l,
      formatMoney(item.quantity),
    ];
  });

  const bodyHtml = `
    <div class="section-label">Items for Delivery</div>
    ${customTableHtml(columns, rows)}
  `;

  return documentShell({
    company,
    title: 'Delivery Order',
    documentNumber: invoice.invoiceNumber,
    titleMeta: [{ label: 'Date', value: formatDate(invoice.invoiceDate) }],
    meta: [
      { label: 'Customer', value: invoice.customer.name },
      { label: 'Dispatch Location', value: invoice.location.name },
      ...(invoice.deliveryAddress
        ? [{ label: 'Delivery Address', value: invoice.deliveryAddress }]
        : []),
    ],
    bodyHtml,
    signOff: ['Dispatched By', 'Received By (Customer)'],
    footerLeft: `Prepared by: ${invoice.preparedByName}`,
  });
}
