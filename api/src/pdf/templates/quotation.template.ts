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
  customer: { name: string };
  items: QuotationItemForTemplate[];
}

export function quotationHtml(
  quotation: QuotationForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'Quantity', align: 'right' as const },
    { header: 'Product' },
    { header: 'Width', align: 'right' as const },
    { header: 'Length', align: 'right' as const },
    { header: 'Rate', align: 'right' as const },
    { header: 'Total Square Feet', align: 'right' as const },
    { header: 'Amount or Price', align: 'right' as const },
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
      formatMoney(item.computedRate),
      formatMoney(item.computedQuantity),
      formatMoney(item.computedAmount),
    ];
  });

  const advanceReceived = Number(quotation.advanceReceived ?? 0);
  const remainingAmount = Math.max(0, Number(quotation.totalAmount) - advanceReceived);

  const bodyHtml = `
    <div class="section-label">Items</div>
    ${customTableHtml(columns, rows)}
    ${totalsHtml([
      { label: 'Subtotal', value: quotation.subtotal, emphasis: 'muted' },
      { label: 'Total Amount', value: quotation.totalAmount },
      { label: 'Advance Received', value: advanceReceived, emphasis: 'muted' },
      { label: 'Remaining Amount', value: remainingAmount, emphasis: 'grand' },
    ])}
    ${quotation.notes ? `<div class="notes"><div class="block"><div class="heading">Notes</div><div>${esc(quotation.notes)}</div></div></div>` : ''}
  `;

  return documentShell({
    company,
    title: 'Quotation',
    documentNumber: quotation.quotationNumber,
    meta: [
      { label: 'Date', value: formatDate(quotation.quotationDate) },
      { label: 'Customer', value: quotation.customer.name },
      {
        label: 'Valid Until',
        value: quotation.validUntil ? formatDate(quotation.validUntil) : 'N/A',
      },
    ],
    bodyHtml,
    signOff: ['Prepared By', 'Customer Acceptance'],
  });
}
