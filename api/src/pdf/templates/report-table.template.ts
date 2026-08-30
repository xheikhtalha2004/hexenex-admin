import {
  CompanySettingsForTemplate,
  documentShell,
  esc,
  formatDate,
  formatMoney,
  Money,
  MetaRow,
} from './document-shell';

export interface ReportColumn {
  header: string;
  key: string;
  money?: boolean;
  align?: 'right';
}

/** Generic tabular report layout — reports stay tabular (unlike the item-based business
 * documents) since they are dense reference data, not something the "no spreadsheet look"
 * feedback was about. */
export function reportTableHtml(
  params: {
    title: string;
    generatedLabel: string;
    meta: MetaRow[];
    columns: ReportColumn[];
    rows: Record<string, Money | string | null | undefined>[];
    totalsRow?: Record<string, Money | string | null | undefined>;
  },
  company: CompanySettingsForTemplate,
): string {
  const { title, generatedLabel, meta, columns, rows, totalsRow } = params;

  function cell(
    col: ReportColumn,
    row: Record<string, Money | string | null | undefined>,
  ) {
    const value = row[col.key];
    if (value === null || value === undefined) return '';
    return col.money ? formatMoney(value) : esc(value);
  }

  const bodyHtml = `
    <table class="plain">
      <thead><tr>${columns.map((c) => `<th${c.money || c.align === 'right' ? ' class="num"' : ''}>${esc(c.header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) =>
              `<tr>${columns.map((c) => `<td${c.money || c.align === 'right' ? ' class="num"' : ''}>${cell(c, row)}</td>`).join('')}</tr>`,
          )
          .join('')}
        ${
          totalsRow
            ? `<tr style="font-weight: 700; border-top: 2px solid #1c1c1c;">${columns
                .map(
                  (c) =>
                    `<td${c.money || c.align === 'right' ? ' class="num"' : ''}>${cell(c, totalsRow)}</td>`,
                )
                .join('')}</tr>`
            : ''
        }
      </tbody>
    </table>
  `;

  return documentShell({
    company,
    title,
    documentNumber: generatedLabel,
    titleMeta: [{ label: 'Generated', value: formatDate(new Date()) }],
    meta,
    bodyHtml,
  });
}
