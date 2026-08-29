import {
  CompanySettingsForTemplate,
  documentShell,
  formatDate,
  formatMoney,
  customTableHtml,
  TableColumn,
  Money,
  totalsHtml,
} from './document-shell';

interface PurchaseInvoiceItemForTemplate {
  product: { name: string };
  quantity: Money;
  unitCost: Money;
  amount: Money;
  landedUnitCost: Money;
}

interface PurchaseInvoiceForTemplate {
  purchaseInvoiceNumber: string;
  invoiceDate: string | Date;
  status: string;
  subtotal: Money;
  freightCost: Money;
  otherDirectCosts: Money;
  supplierPayableAmount: Money;
  supplier: { name: string };
  location: { name: string };
  items: PurchaseInvoiceItemForTemplate[];
}

export function purchaseInvoiceHtml(
  invoice: PurchaseInvoiceForTemplate,
  company: CompanySettingsForTemplate,
): string {
  const columns = [
    { header: 'SN', align: 'center' as const },
    { header: 'Product' },
    { header: 'Quantity (sq ft)', align: 'right' as const },
    { header: 'Unit Cost', align: 'right' as const },
    { header: 'Amount', align: 'right' as const },
  ];

  const rows = invoice.items.map((item, i) => [
    String(i + 1),
    item.product.name,
    formatMoney(item.quantity),
    formatMoney(item.unitCost),
    formatMoney(item.amount),
  ]);

  const totalLandedCost =
    Number(invoice.subtotal) +
    Number(invoice.freightCost) +
    Number(invoice.otherDirectCosts);

  const bodyHtml = `
    <div class="section-label">Items Received</div>
    ${customTableHtml(columns, rows)}
    ${totalsHtml([
      { label: 'Goods Subtotal', value: invoice.subtotal, emphasis: 'muted' },
      {
        label: 'Freight / Inward',
        value: invoice.freightCost,
        emphasis: 'muted',
      },
      {
        label: 'Other Direct Costs',
        value: invoice.otherDirectCosts,
        emphasis: 'muted',
      },
      { label: 'Total Landed Cost', value: totalLandedCost, emphasis: 'grand' },
      {
        label: 'Payable to Supplier',
        value: invoice.supplierPayableAmount,
        emphasis: 'muted',
      },
    ])}
  `;

  return documentShell({
    company,
    title: 'Purchase Invoice',
    documentNumber: invoice.purchaseInvoiceNumber,
    meta: [
      { label: 'Date', value: formatDate(invoice.invoiceDate) },
      { label: 'Supplier', value: invoice.supplier.name },
      { label: 'Receiving Location', value: invoice.location.name },
    ],
    bodyHtml,
    signOff: ['Received By', 'Verified By'],
  });
}
