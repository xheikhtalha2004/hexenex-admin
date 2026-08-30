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

interface QuotationItemForTemplate {
  product: { name: string };
  computedQuantity: Money;
  computedRate: Money;
  computedAmount: Money;
  inputParameters?: unknown;
}

/** Renders `unknown` JSON values (from `inputParameters`) as display text, but only when they're
 * actually a string or number — anything else (including objects) falls back to "?" instead of
 * risking `[object Object]`. */
function displayValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '?';
}



interface QuotationForTemplate {
  quotationNumber: string;
  quotationDate: string | Date;
  status: string;
  validUntil?: string | Date | null;
  notes?: string | null;
  subtotal: Money;
  discountAmount: Money;
  totalAmount: Money;
  advanceReceived?: Money;
  preparedByName: string;
  customer: { name: string; currentBalance: Money };
  items: QuotationItemForTemplate[];
}

export function quotationHtml(
  quotation: QuotationForTemplate,
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

  const rows = quotation.items.map((item) => {
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
      w = p.width != null ? displayValue(p.width) : (sizeOption !== 'FIX' ? sizeOption : '?');
    }
    
    return [
      qty,
      esc(item.product.name),
      w,
      l,
      formatMoney(item.computedQuantity),
      formatMoney(item.computedRate),
      formatMoney(item.computedAmount),
    ];
  });

  const totalSquareFeet = quotation.items.reduce(
    (sum, item) => sum + Number(item.computedQuantity),
    0,
  );
  const grossTotal = Number(quotation.subtotal);
  // Customer credit is not an outstanding Previous Balance on a quotation.
  const previousBalance = Math.max(
    0,
    Number(quotation.customer.currentBalance ?? 0),
  );
  const totalAmount = previousBalance + grossTotal;
  const received = Number(quotation.advanceReceived ?? 0);
  const balance = Math.max(0, totalAmount - received);

  const summaryRows = [
    { label: 'Gross Total', value: grossTotal, emphasis: 'muted' as const },
    { label: 'Previous Balance', value: previousBalance, emphasis: 'muted' as const },
    { label: 'Total Amount', value: totalAmount },
    { label: 'Received', value: received, emphasis: 'muted' as const },
    ...(balance > 0
      ? [{ label: 'Balance', value: balance, emphasis: 'grand' as const }]
      : []),
  ];

  const bodyHtml = `
    <div class="section-label">Items</div>
    ${customTableHtml(columns, rows)}
    ${splitSummaryHtml('T. Sq. Ft.', totalSquareFeet, summaryRows)}
    ${quotation.notes ? `<div class="notes"><div class="block"><div class="heading">Notes</div><div>${esc(quotation.notes)}</div></div></div>` : ''}
  `;

  return documentShell({
    company,
    title: 'Quotation',
    documentNumber: quotation.quotationNumber,
    titleMeta: [
      { label: 'Date', value: formatDate(quotation.quotationDate) },
      {
        label: 'Valid Until Date',
        value: quotation.validUntil ? formatDate(quotation.validUntil) : 'N/A',
      },
    ],
    meta: [
      { label: 'Customer', value: quotation.customer.name },
    ],
    bodyHtml,
    footerLeft: `Prepared by: ${quotation.preparedByName}`,
    extraStyles: UNIFIED_INVOICE_STYLES,
  });
}
