import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SalesInvoicesService } from './sales-invoices.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { ListSalesInvoicesQueryDto } from './dto/list-sales-invoices-query.dto';
import { CreateFromQuotationDto } from './dto/create-from-quotation.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import {
  deliveryOrderHtml,
  salesInvoiceHtml,
} from '../pdf/templates/sales-invoice.template';

@Controller('sales-invoices')
@RequirePermissions('sales_invoice.view')
export class SalesInvoicesController {
  constructor(
    private readonly salesInvoices: SalesInvoicesService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get()
  list(@Query() query: ListSalesInvoicesQueryDto) {
    return this.salesInvoices.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesInvoices.findOrThrow(id);
  }

  @Get(':id/pdf')
  async pdfDownload(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [invoice, company] = await Promise.all([
      this.salesInvoices.findOrThrow(id),
      this.companySettings.get(),
    ]);
    const buffer = await this.pdf.renderHtmlToPdf(
      salesInvoiceHtml(invoice, company),
    );
    // No filename here — a "*.pdf" filename combined with the application/pdf mimetype makes
    // Chrome's PDF-viewer intercept the response at the fetch() level (this is fetched as a
    // blob via JS, not navigated to directly) — Content-Type alone is what the blob needs to
    // render correctly once opened via a blob: URL.
    res.set({ 'Content-Type': 'application/octet-stream' });
    res.send(buffer);
  }

  @Get(':id/delivery-order/pdf')
  async deliveryOrderPdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [invoice, company] = await Promise.all([
      this.salesInvoices.findOrThrow(id),
      this.companySettings.get(),
    ]);
    const buffer = await this.pdf.renderHtmlToPdf(
      deliveryOrderHtml(invoice, company),
    );
    res.set({ 'Content-Type': 'application/octet-stream' });
    res.send(buffer);
  }

  @Post()
  @RequirePermissions('sales_invoice.create')
  create(
    @Body() dto: CreateSalesInvoiceDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.salesInvoices.create(dto, actor.id);
  }

  @Post('from-quotation/:quotationId')
  @RequirePermissions('quotation.convert')
  createFromQuotation(
    @Param('quotationId') quotationId: string,
    @Body() dto: CreateFromQuotationDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.salesInvoices.createFromQuotation(quotationId, dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('sales_invoice.edit')
  update(
    @Param('id') id: string,
    @Body() dto: CreateSalesInvoiceDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.salesInvoices.update(id, dto, actor.id);
  }

  @Post(':id/finalize')
  @RequirePermissions('sales_invoice.finalize')
  finalize(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.salesInvoices.finalize(id, actor.id);
  }

}
