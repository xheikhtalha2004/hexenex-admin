import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PurchasesService } from './purchases.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { purchaseInvoiceHtml } from '../pdf/templates/purchase-invoice.template';

@Controller('purchases')
@RequirePermissions('purchase_invoice.view')
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get()
  list(@Query() query: ListPurchasesQueryDto) {
    return this.purchases.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchases.findOrThrow(id);
  }

  @Get(':id/pdf')
  async pdfDownload(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [invoice, company] = await Promise.all([
      this.purchases.findForPdf(id),
      this.companySettings.get(),
    ]);
    const buffer = await this.pdf.renderHtmlToPdf(
      purchaseInvoiceHtml(invoice, company),
    );
    res.set({ 'Content-Type': 'application/octet-stream' });
    res.send(buffer);
  }

  @Post()
  @RequirePermissions('purchase_invoice.create')
  create(
    @Body() dto: CreatePurchaseInvoiceDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.purchases.create(dto, actor.id);
  }

  @Post(':id/finalize')
  @RequirePermissions('purchase_invoice.finalize')
  finalize(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.purchases.finalize(id, actor.id);
  }
}
