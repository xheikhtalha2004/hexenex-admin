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
  customer: { name: string };
  salesInvoice: { invoiceNumber: string; locationId?: string };
  items: SalesReturnItemForTemplate[];
}

export function salesReturnHtml(
  salesReturn: SalesReturnForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'SN', align: 'center' as const },
    { header: 'Product & Description' },
    { header: 'Returned Size' },
    { header: 'Usable (Restocked)' },
    { header: 'Rate', align: 'right' as const },
    { header: 'Amount', align: 'right' as const },
  ];

  const rows = salesReturn.items.map((item, i) => {
    const desc = item.description ? `<br/><span style="font-size:8.5px;color:#555;">${esc(item.description)}</span>` : '';
    const name = esc(item.product.name) + desc;
    
    let returnedSize = '?';
    let usableSize = '-';
    
    if (item.sizeOption === 'SELF' || (!item.width && !item.length)) {
      returnedSize = `${formatMoney(item.quantity)} sq ft (direct)`;
    } else {
      const p = item.pieces != null ? formatMoney(item.pieces) : '?';
      const w = item.width != null ? formatMoney(item.width) : '?';
      const l = item.length != null ? formatMoney(item.length) : '?';
      returnedSize = `${p} pcs × ${w}in × ${l}in`;
      
      const trimmed =
        item.usableWidth != null &&
        item.usableLength != null &&
        (Number(item.usableWidth) !== Number(item.width) ||
          Number(item.usableLength) !== Number(item.length));
          
      if (trimmed) {
        usableSize = `${formatMoney(item.usableWidth!)}in × ${formatMoney(item.usableLength!)}in<br/><span style="font-size:8.5px;color:#555;">${formatMoney(item.quantity)} sq ft</span>`;
      } else {
        usableSize = `${formatMoney(item.quantity)} sq ft`;
      }
    }

    return [
      String(i + 1),
      name,
      returnedSize,
      usableSize,
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
    meta: [
      { label: 'Date', value: formatDate(salesReturn.returnDate) },
      { label: 'Customer', value: salesReturn.customer.name },
      {
        label: 'Against Invoice',
        value: salesReturn.salesInvoice.invoiceNumber,
      },
    ],
    bodyHtml,
    signOff: ['Returned By', 'Received By (Warehouse)'],
  });
}
