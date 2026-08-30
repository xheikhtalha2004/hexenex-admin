import {
  CompanySettingsForTemplate,
  documentShell,
  esc,
  formatDate,
  formatMoney,
  customTableHtml,
  Money,
  totalsHtml,
} from './document-shell';

interface SalesReturnItemForTemplate {
  product: { name: string };
  description?: string | null;
  sizeOption?: string | null;
  pieces?: Money | null;
  width?: Money | null;
  length?: Money | null;
  usableWidth?: Money | null;
  usableLength?: Money | null;
  quantity: Money;
  rate: Money;
  amount: Money;
}

interface SalesReturnForTemplate {
  returnNumber: string;
  returnDate: string | Date;
  reason?: string | null;
  totalAmount: Money;
  preparedByName: string;
  customer: { name: string };
  salesInvoice: { invoiceNumber: string; locationId?: string };
  items: SalesReturnItemForTemplate[];
}

export function salesReturnHtml(
  salesReturn: SalesReturnForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'Qty', align: 'center' as const },
    { header: 'Product', align: 'center' as const },
    { header: 'Width', align: 'center' as const },
    { header: 'Length', align: 'center' as const },
    { header: 'Usable W', align: 'center' as const },
    { header: 'Usable L', align: 'center' as const },
    { header: 'Sq Ft', align: 'center' as const },
    { header: 'Rate', align: 'center' as const },
    { header: 'Amount', align: 'center' as const },
  ];

  const rows = salesReturn.items.map((item) => {
    const desc = item.description
      ? `<br/><span style="font-size:8.5px;color:#555;">${esc(item.description)}</span>`
      : '';
    const name = esc(item.product.name) + desc;
    const isSelf = item.sizeOption === 'SELF';
    const standardWidth =
      item.sizeOption && item.sizeOption !== 'FIX' && item.sizeOption !== 'SELF'
        ? item.sizeOption
        : null;
    const width = isSelf
      ? '-'
      : item.width != null
        ? formatMoney(item.width)
        : (standardWidth ?? '-');
    const length =
      isSelf || item.length == null ? '-' : formatMoney(item.length);
    const usableWidth = isSelf
      ? '-'
      : item.usableWidth != null
        ? formatMoney(item.usableWidth)
        : width;
    const usableLength = isSelf
      ? '-'
      : item.usableLength != null
        ? formatMoney(item.usableLength)
        : length;

    return [
      isSelf || item.pieces == null ? '-' : formatMoney(item.pieces),
      name,
      width,
      length,
      usableWidth,
      usableLength,
      formatMoney(item.quantity),
      formatMoney(item.rate),
      formatMoney(item.amount),
    ];
  });

  const bodyHtml = `
    <div class="section-label">Returned Items</div>
    ${customTableHtml(columns, rows)}
    ${totalsHtml([{ label: 'Total Credited', value: salesReturn.totalAmount, emphasis: 'grand' }])}
    ${salesReturn.reason ? `<div class="notes"><div class="block"><div class="heading">Reason</div><div>${esc(salesReturn.reason)}</div></div></div>` : ''}
  `;

  return documentShell({
    company,
    title: 'Sales Return',
    documentNumber: salesReturn.returnNumber,
    titleMeta: [{ label: 'Date', value: formatDate(salesReturn.returnDate) }],
    meta: [
      { label: 'Customer', value: salesReturn.customer.name },
      {
        label: 'Against Invoice',
        value: salesReturn.salesInvoice.invoiceNumber,
      },
    ],
    bodyHtml,
    signOff: ['Returned By', 'Received By (Warehouse)'],
    footerLeft: `Prepared by: ${salesReturn.preparedByName}`,
  });
}
