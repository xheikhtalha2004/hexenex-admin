import {
  CompanySettingsForTemplate,
  documentShell,
  esc,
  formatDate,
  formatMoney,
  Money,
} from './document-shell';

interface PaymentReceiptParams {
  documentNumber: string;
  title: string;
  partyLabel: string;
  partyName: string;
  amount: Money;
  paymentMethod: string;
  referenceNo?: string | null;
  remarks?: string | null;
  paymentDate: string | Date;
  /** Balance breakdown — omitted (falls back to a plain Amount figure) if not supplied. */
  previousBalance?: Money;
  remainingBalance?: Money;
}

export function paymentReceiptHtml(
  params: PaymentReceiptParams,
  company: CompanySettingsForTemplate,
): string {
  const hasBalanceBreakdown =
    params.previousBalance !== undefined &&
    params.remainingBalance !== undefined;

  const balanceRows = hasBalanceBreakdown
    ? `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #666; font-size: 11.5px;"><span>Previous Balance</span><span>${formatMoney(params.previousBalance!)}</span></div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; font-weight: 700; font-size: 16px; margin: 4px 0;"><span>Amount Received</span><span>${formatMoney(params.amount)}</span></div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #666; font-size: 11.5px; border-top: 1px solid #eee; padding-top: 8px;"><span>Remaining Balance</span><span>${formatMoney(params.remainingBalance!)}</span></div>
    `
    : `
      <div style="font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: 0.04em;">Amount</div>
      <div style="font-size: 30px; font-weight: 700; margin-bottom: 20px;">${formatMoney(params.amount)}</div>
    `;

  const bodyHtml = `
    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 24px; margin-top: 8px;">
      <div style="font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: 0.04em;">${esc(params.partyLabel)}</div>
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 20px;">${esc(params.partyName)}</div>
      ${balanceRows}
      <table style="width: 100%; font-size: 12px; margin-top: 12px;">
        <tr><td style="color: #777; padding: 4px 0; width: 160px;">Payment Method</td><td style="font-weight: 600;">${esc(params.paymentMethod.replace(/_/g, ' '))}</td></tr>
        ${params.referenceNo ? `<tr><td style="color: #777; padding: 4px 0;">Reference</td><td style="font-weight: 600;">${esc(params.referenceNo)}</td></tr>` : ''}
        ${params.remarks ? `<tr><td style="color: #777; padding: 4px 0;">Remarks</td><td>${esc(params.remarks)}</td></tr>` : ''}
      </table>
    </div>
  `;

  return documentShell({
    company,
    title: params.title,
    documentNumber: params.documentNumber,
    meta: [{ label: 'Date', value: formatDate(params.paymentDate) }],
    bodyHtml,
  });
}

interface SettlementReceiptParams {
  documentNumber: string;
  amount: Money;
  customerName: string;
  supplierName: string;
  remarks?: string | null;
  settlementDate: string | Date;
}

/** A settlement touches two parties in one action, so it gets its own receipt shape rather than
 * reusing the single-party payment-receipt layout. */
export function settlementReceiptHtml(
  params: SettlementReceiptParams,
  company: CompanySettingsForTemplate,
): string {
  const bodyHtml = `
    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 24px; margin-top: 8px;">
      <div style="display: flex; gap: 32px; margin-bottom: 20px;">
        <div>
          <div style="font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: 0.04em;">Paid By</div>
          <div style="font-size: 16px; font-weight: 700;">${esc(params.customerName)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: 0.04em;">Paid To</div>
          <div style="font-size: 16px; font-weight: 700;">${esc(params.supplierName)}</div>
        </div>
      </div>
      <div style="font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: 0.04em;">Amount</div>
      <div style="font-size: 30px; font-weight: 700; margin-bottom: 20px;">${formatMoney(params.amount)}</div>
      ${params.remarks ? `<div style="font-size: 12px;"><span style="color: #777;">Remarks:</span> ${esc(params.remarks)}</div>` : ''}
    </div>
  `;

  return documentShell({
    company,
    title: 'Payment',
    documentNumber: params.documentNumber,
    meta: [{ label: 'Date', value: formatDate(params.settlementDate) }],
    bodyHtml,
  });
}
