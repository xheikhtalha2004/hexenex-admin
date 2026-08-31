import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CustomerLedgerService } from './customer-ledger.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { statementHtml } from '../pdf/templates/statement.template';

@Controller('customers/:customerId/ledger')
@RequirePermissions('customer_ledger.view')
export class CustomerLedgerController {
  constructor(
    private readonly ledger: CustomerLedgerService,
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get()
  getStatement(
    @Param('customerId') customerId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.ledger.getStatement(customerId, {
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page,
      pageSize,
    });
  }

  @Get('pdf')
  async pdfDownload(
    @Param('customerId') customerId: string,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const [statement, company] = await Promise.all([
      this.ledger.getStatement(customerId, {
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        pageSize: 1000,
      }),
      this.companySettings.get(),
    ]);

    const html = this.pdf.renderHtml(statementHtml(
      {
        title: 'Customer Statement',
        documentNumber: customer.id.slice(-8).toUpperCase(),
        partyName: customer.name,
        currentBalance: customer.currentBalance,
        entries: statement.data,
      },
      company,
    ));
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }
}
