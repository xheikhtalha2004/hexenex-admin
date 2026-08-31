import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SupplierLedgerService } from './supplier-ledger.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { statementHtml } from '../pdf/templates/statement.template';

@Controller('suppliers/:supplierId/ledger')
@RequirePermissions('supplier_ledger.view')
export class SupplierLedgerController {
  constructor(
    private readonly ledger: SupplierLedgerService,
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get()
  getStatement(
    @Param('supplierId') supplierId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.ledger.getStatement(supplierId, {
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page,
      pageSize,
    });
  }

  @Get('pdf')
  async pdfDownload(
    @Param('supplierId') supplierId: string,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const [statement, company] = await Promise.all([
      this.ledger.getStatement(supplierId, {
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        pageSize: 1000,
      }),
      this.companySettings.get(),
    ]);

    const html = this.pdf.renderHtml(statementHtml(
      {
        title: 'Supplier Statement',
        documentNumber: supplier.id.slice(-8).toUpperCase(),
        partyName: supplier.name,
        currentBalance: supplier.currentBalance,
        entries: statement.data,
      },
      company,
    ));
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }
}
