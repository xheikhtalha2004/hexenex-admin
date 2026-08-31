import type { Prisma } from '@prisma/client';

/** Prisma returns Decimal for every money/quantity field — templates accept any of these. */
export type Money = Prisma.Decimal | string | number;

export interface CompanySettingsForTemplate {
  companyName: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
}

export interface MetaRow {
  label: string;
  value: string;
}

/** Escapes user-entered text before it's interpolated into the HTML that Puppeteer renders. */
export function esc(value: Money | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMoney(value: Money): string {
  const num = Number(value);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export interface TotalsRow {
  label: string;
  value: Money;
  emphasis?: 'grand' | 'muted';
}

export function totalsHtml(rows: TotalsRow[]): string {
  return `<div class="totals">${rows
    .map(
      (r) =>
        `<div class="row${r.emphasis === 'grand' ? ' grand' : ''}${r.emphasis === 'muted' ? ' muted' : ''}"><span>${esc(r.label)}</span><span>${formatMoney(r.value)}</span></div>`,
    )
    .join('')}</div>`;
}

/** Shared split summary used by quotations, sales invoices, and purchase invoices. */
export function splitSummaryHtml(
  leftLabel: string,
  leftValue: Money,
  rows: TotalsRow[],
): string {
  return `<div class="document-summary">
    <div class="summary-measure"><span>${esc(leftLabel)}</span><span>${formatMoney(leftValue)}</span></div>
    ${totalsHtml(rows)}
  </div>`;
}

/** Keeps the quotation, sales invoice, and purchase invoice visually identical. */
export const UNIFIED_INVOICE_STYLES = `
  .letterhead { border-bottom: none; margin-bottom: 12px; padding-bottom: 0; }
  .meta-grid { grid-template-columns: 1fr; margin-bottom: 18px; }
  table.classic-table { margin-bottom: 0; }
  .document-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-top: 14px; }
  .document-summary .summary-measure { display: flex; justify-content: space-between; width: 145px; padding: 5px 0; font-size: 11.5px; font-weight: 700; color: #000; }
  .document-summary .totals { margin-top: 0; }
  body,
  .letterhead .company-details,
  .letterhead .doc-title .doc-number,
  .letterhead .doc-title-meta .label,
  .letterhead .doc-title-meta .value,
  .meta-grid .meta-item .label,
  .meta-grid .meta-item .value,
  .section-label,
  table.classic-table td,
  .totals .row,
  .totals .row.muted,
  .notes,
  .notes .heading,
  .footer { color: #000 !important; }
  table.classic-table th { color: #fff !important; }
`;

export interface TableColumn {
  header: string;
  align?: 'left' | 'right' | 'center';
}

export function customTableHtml(
  columns: TableColumn[],
  rows: string[][],
): string {
  const alignClass = (align?: string) =>
    align === 'right'
      ? ' class="num"'
      : align === 'center'
        ? ' style="text-align:center"'
        : '';

  const thead = `<tr>${columns.map((c) => `<th${alignClass(c.align)}>${esc(c.header)}</th>`).join('')}</tr>`;

  const tbody = rows
    .map(
      (row) =>
        `<tr>${row.map((cell, i) => `<td${alignClass(columns[i]?.align)}>${cell}</td>`).join('')}</tr>`,
    )
    .join('');

  return `
    <table class="classic-table">
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1c1c; margin: 0; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: 277mm; padding: 10mm 12mm; display: flex; flex-direction: column; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: none; padding-bottom: 0; margin-bottom: 12px; }
  .letterhead .company { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .letterhead .company img { display: block; max-height: 58px; max-width: 160px; object-fit: contain; }
  .letterhead .company-name { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
  .letterhead .company-details { font-size: 11px; color: #000; line-height: 1.5; margin-top: 2px; }
  .letterhead .doc-title { text-align: right; }
  .letterhead .doc-title h1 { font-size: 21px; margin: 0 0 4px; letter-spacing: 0.06em; font-weight: 700; }
  .letterhead .doc-title .doc-number { font-size: 13px; font-weight: 600; color: #000; }
  .letterhead .doc-title-meta { margin-top: 10px; display: grid; gap: 5px; min-width: 170px; }
  .letterhead .doc-title-meta .item { display: flex; justify-content: space-between; gap: 16px; font-size: 10px; }
  .letterhead .doc-title-meta .label { color: #000; text-transform: uppercase; letter-spacing: 0.04em; }
  .letterhead .doc-title-meta .value { color: #000; font-weight: 600; }

  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 24px; margin-bottom: 22px; font-size: 11.5px; }
  .meta-grid .meta-item .label { color: #888; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; margin-bottom: 2px; }
  .meta-grid .meta-item .value { font-weight: 600; color: #1c1c1c; }

  .section-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #999; font-weight: 700; margin: 0 0 6px; }

  .totals { width: 300px; margin-left: auto; font-size: 12px; margin-top: 14px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .row.muted { color: #888; font-size: 11.5px; }
  .totals .row.grand { border-top: 2px solid #1c1c1c; font-weight: 700; font-size: 15.5px; padding-top: 10px; margin-top: 6px; }

  .amount-words { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ccc; font-size: 11px; }
  .amount-words .label { color: #888; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; margin-bottom: 3px; }
  .amount-words .value { font-weight: 600; }

  .notes { margin-top: 18px; font-size: 11px; color: #444; }
  .notes .heading { font-weight: 600; color: #1c1c1c; margin-bottom: 2px; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.04em; color: #999; }
  .notes .block + .block { margin-top: 10px; }

  .sign-off { margin-top: 46px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .sign-off .box { border-top: 1px solid #999; padding-top: 6px; font-size: 10.5px; color: #666; text-align: center; }

  .footer { margin-top: auto; padding-top: 10px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 9.5px; color: #000; }

  table.plain { width: 100%; border-collapse: collapse; }
  table.plain th { background: #f6f6f6; text-align: left; padding: 7px 9px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; border-bottom: 1px solid #ddd; }
  table.plain td { padding: 7px 9px; border-bottom: 1px solid #eee; font-size: 11px; }
  table.plain td.num, table.plain th.num { text-align: right; font-family: 'Consolas', monospace; }

  table.classic-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10.5px; }
  table.classic-table th { background: #111827; color: #fff; text-align: left; padding: 6px 8px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid #111827; }
  table.classic-table td { padding: 6px 8px; border: 1px solid #ccc; }
  table.classic-table td.num, table.classic-table th.num { text-align: right; font-family: 'Consolas', monospace; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .badge.positive { background: #e6f4ea; color: #1e7e34; }
  .badge.negative { background: #fbe9e7; color: #c62828; }
`;

export function documentShell(params: {
  company: CompanySettingsForTemplate;
  title: string;
  documentNumber: string;
  titleMeta?: MetaRow[];
  meta: MetaRow[];
  bodyHtml: string;
  extraStyles?: string;
  signOff?: string[];
  footerLeft?: string;
}): string {
  const {
    company,
    title,
    documentNumber,
    titleMeta,
    meta,
    bodyHtml,
    extraStyles,
    signOff,
    footerLeft,
  } = params;
  const footerText = footerLeft?.trim() || 'Prepared by: System';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>${BASE_STYLES}${extraStyles ?? ''}</style>
<script>window.addEventListener('load', () => window.print());</script>
</head>
<body>
  <div class="page">
    <div class="letterhead">
      <div class="company">
        ${company.logoUrl ? `<img src="${esc(company.logoUrl)}" alt="" onerror="this.style.display='none'" />` : ''}
        <div>
          <div class="company-name">${esc(company.companyName)}</div>
          <div class="company-details">
            ${company.addressLine1 ? esc(company.addressLine1) + '<br/>' : ''}
            ${company.addressLine2 ? esc(company.addressLine2) + '<br/>' : ''}
            ${[company.phone, company.phone2, company.email].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ')}
            ${company.website ? `<br/>${esc(company.website)}` : ''}
          </div>
        </div>
      </div>
      <div class="doc-title">
        <h1>${esc(title)}</h1>
        <div class="doc-number">${esc(documentNumber)}</div>
        ${
          titleMeta?.length
            ? `<div class="doc-title-meta">${titleMeta
                .map(
                  (m) =>
                    `<div class="item"><span class="label">${esc(m.label)}</span><span class="value">${esc(m.value)}</span></div>`,
                )
                .join('')}</div>`
            : ''
        }
      </div>
    </div>

    ${
      meta.length
        ? `<div class="meta-grid">
      ${meta
        .map(
          (m) =>
            `<div class="meta-item"><div class="label">${esc(m.label)}</div><div class="value">${esc(m.value)}</div></div>`,
        )
        .join('')}
    </div>`
        : ''
    }

    ${bodyHtml}

    ${
      signOff && signOff.length
        ? `<div class="sign-off">${signOff.map((label) => `<div class="box">${esc(label)}</div>`).join('')}</div>`
        : ''
    }

    <div class="footer">
      <span>${esc(footerText)}</span>
      <span>${esc(company.companyName)}</span>
    </div>
  </div>
</body>
</html>`;
}
