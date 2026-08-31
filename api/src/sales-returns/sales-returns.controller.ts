import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SalesReturnsService } from './sales-returns.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';
import { ListSalesReturnsQueryDto } from './dto/list-sales-returns-query.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { salesReturnHtml } from '../pdf/templates/sales-return.template';

@Controller('sales-returns')
@RequirePermissions('sales_return.view')
export class SalesReturnsController {
  constructor(
    private readonly salesReturns: SalesReturnsService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get()
  list(@Query() query: ListSalesReturnsQueryDto) {
    return this.salesReturns.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesReturns.findOrThrow(id);
  }

  @Get(':id/pdf')
  async pdfDownload(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [salesReturn, company] = await Promise.all([
      this.salesReturns.findForPdf(id),
      this.companySettings.get(),
    ]);
    const html = this.pdf.renderHtml(salesReturnHtml(salesReturn, company));
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }

  @Post()
  @RequirePermissions('sales_return.create')
  create(@Body() dto: CreateSalesReturnDto, @CurrentUser() actor: RequestUser) {
    return this.salesReturns.create(dto, actor.id);
  }
}
