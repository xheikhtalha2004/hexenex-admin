import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  money?: boolean;
}

@Injectable()
export class ExcelService {
  async buildWorkbook(sheetName: string, columns: ExcelColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hexenex ERP';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };

    for (const row of rows) {
      sheet.addRow(row);
    }

    for (const col of columns.filter((c) => c.money)) {
      const column = sheet.getColumn(col.key);
      column.numFmt = '#,##0.00';
      column.alignment = { horizontal: 'right' };
    }

    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
