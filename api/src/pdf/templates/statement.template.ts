import {
  CompanySettingsForTemplate,
  documentShell,
  esc,
  formatDate,
  formatMoney,
  Money,
} from './document-shell';

interface StatementEntry {
  entryDate: string | Date;
  entryType: string;
  description?: string | null;
  counterpartyLabel?: string | null;
  amount: Money;
  balanceAfter: Money;
}

interface StatementParams {
  title: string;
  documentNumber: string;
  partyName: string;
  currentBalance: Money;
  entries: StatementEntry[];
}

export function statementHtml(
  params: StatementParams,
  company: CompanySettingsForTemplate,
): string {
  const rows = params.entries
    .map(
      (e) => `<tr>
        <td>${formatDate(e.entryDate)}</td>
        <td>${esc(e.entryType.replace(/_/g, ' '))}</td>
        <td>${esc(e.description)}${e.counterpartyLabel ? ` <strong>${esc(e.counterpartyLabel)}</strong>` : ''}</td>
        <td class="num">${Number(e.amount) >= 0 ? '+' : ''}${formatMoney(e.amount)}</td>
        <td class="num">${formatMoney(e.balanceAfter)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `
    <table class="items">
      <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row grand"><span>Current Balance</span><span>${formatMoney(params.currentBalance)}</span></div>
    </div>
  `;

  return documentShell({
    company,
    title: params.title,
    documentNumber: params.documentNumber,
    titleMeta: [{ label: 'Generated', value: formatDate(new Date()) }],
    meta: [
      { label: 'Party', value: params.partyName },
      { label: 'Entries', value: String(params.entries.length) },
    ],
    bodyHtml,
  });
}
