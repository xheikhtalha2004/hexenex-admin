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

interface PurchaseInvoiceItemForTemplate {
  product: { name: string };
  quantity: Money;
  unitCost: Money;
  amount: Money;
  landedUnitCost: Money;
  inputParameters?: unknown;
}

interface PurchaseInvoiceForTemplate {
  purchaseInvoiceNumber: string;
  invoiceDate: string | Date;
  status: string;
  subtotal: Money;
  freightCost: Money;
  otherDirectCosts: Money;
  supplierPayableAmount: Money;
  preparedByName: string;
  supplier: { name: string };
  location: { name: string };
  items: PurchaseInvoiceItemForTemplate[];
}

export function purchaseInvoiceHtml(
  invoice: PurchaseInvoiceForTemplate,
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
    const parameters = item.inputParameters as Record<string, unknown> | undefined;
    const sizeOption = typeof parameters?.sizeOption === 'string' ? parameters.sizeOption : '';
    const isSelf = sizeOption === 'SELF';
    const display = (value: unknown) =>
      typeof value === 'number' || typeof value === 'string' ? String(value) : '-';
    const pieceQuantity = isSelf ? '-' : display(parameters?.quantity);
    const width = isSelf
      ? '-'
      : parameters?.width != null
        ? display(parameters.width)
        : sizeOption && sizeOption !== 'FIX'
          ? sizeOption
          : '-';
    const length = isSelf ? '-' : display(parameters?.length);

    return [
      pieceQuantity,
      esc(item.product.name),
      width,
      length,
      formatMoney(item.quantity),
      formatMoney(item.unitCost),
      formatMoney(item.amount),
    ];
  });

  const totalSquareFeet = invoice.items.reduce(
    (sum, item) => sum + Number(item.quantity),
    0,
  );

  const totalLandedCost =
    Number(invoice.subtotal) +
    Number(invoice.freightCost) +
    Number(invoice.otherDirectCosts);

  const bodyHtml = `
    <div class="section-label">Items Received</div>
    ${customTableHtml(columns, rows)}
    ${splitSummaryHtml('T. Sq. Ft.', totalSquareFeet, [
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
      { label: 'Total Landed Cost', value: totalLandedCost },
      {
        label: 'Payable to Supplier',
        value: invoice.supplierPayableAmount,
        emphasis: 'grand',
      },
    ])}
  `;

  return documentShell({
    company,
    title: 'Purchase Invoice',
    documentNumber: invoice.purchaseInvoiceNumber,
    titleMeta: [{ label: 'Date', value: formatDate(invoice.invoiceDate) }],
    meta: [
      { label: 'Supplier', value: invoice.supplier.name },
      { label: 'Receiving Location', value: invoice.location.name },
    ],
    bodyHtml,
    footerLeft: `Prepared by: ${invoice.preparedByName}`,
    extraStyles: UNIFIED_INVOICE_STYLES,
  });
}
