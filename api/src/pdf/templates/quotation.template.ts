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
  customer: { name: string };
  items: QuotationItemForTemplate[];
}

export function quotationHtml(
  quotation: QuotationForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'SN', align: 'center' as const },
    { header: 'Product & Description' },
    { header: 'Size' },
    { header: 'Qty', align: 'right' as const },
    { header: 'W (in)', align: 'right' as const },
    { header: 'L (in)', align: 'right' as const },
    { header: 'Rate', align: 'right' as const },
    { header: 'Sq Ft', align: 'right' as const },
    { header: 'Amount', align: 'right' as const },
  ];

  const rows = quotation.items.map((item, i) => {
    const p = item.inputParameters as Record<string, unknown> | undefined;
    const sizeOption = typeof p?.sizeOption === 'string' ? p.sizeOption : '';
    const desc = p && typeof p.description === 'string' ? p.description : '';
    const productCol = desc ? `${esc(item.product.name)}<br/><span style="font-size:8.5px;color:#555;">${esc(desc)}</span>` : esc(item.product.name);
    
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
      String(i + 1),
      productCol,
      esc(sizeOption === 'FIX' ? 'Fix (custom width)' : sizeOption === 'SELF' ? 'Self (entered sqft directly)' : sizeOption + ' in (standard)'),
      qty,
      w,
      l,
      formatMoney(item.computedRate),
      formatMoney(item.computedQuantity),
      formatMoney(item.computedAmount),
    ];
  });

  const bodyHtml = `
    <div class="section-label">Items</div>
    ${customTableHtml(columns, rows)}
    ${totalsHtml([
      { label: 'Subtotal', value: quotation.subtotal, emphasis: 'muted' },
      { label: 'Discount', value: quotation.discountAmount, emphasis: 'muted' },
      { label: 'Total', value: quotation.totalAmount, emphasis: 'grand' },
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
