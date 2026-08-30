import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { QuotationsService } from './quotations.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { ListQuotationsQueryDto } from './dto/list-quotations-query.dto';
import { RejectQuotationDto } from './dto/reject-quotation.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { quotationHtml } from '../pdf/templates/quotation.template';

@Controller('quotations')
@RequirePermissions('quotation.view')
export class QuotationsController {
  constructor(
    private readonly quotations: QuotationsService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get()
  list(@Query() query: ListQuotationsQueryDto) {
    return this.quotations.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotations.findOrThrow(id);
  }

  @Get(':id/pdf')
  async pdfDownload(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const [quotation, company] = await Promise.all([this.quotations.findForPdf(id), this.companySettings.get()]);
    const buffer = await this.pdf.renderHtmlToPdf(quotationHtml(quotation, company));
    // No filename here — see the comment in customer-payments.controller.ts's pdfDownload.
    res.set({ 'Content-Type': 'application/octet-stream' });
    res.send(buffer);
  }

  @Post()
  @RequirePermissions('quotation.create')
  create(@Body() dto: CreateQuotationDto, @CurrentUser() actor: RequestUser) {
    return this.quotations.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('quotation.edit')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto, @CurrentUser() actor: RequestUser) {
    return this.quotations.update(id, dto, actor.id);
  }

  @Post(':id/approve')
  @RequirePermissions('quotation.approve')
  approve(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.quotations.approve(id, actor.id);
  }

  @Post(':id/reject')
  @RequirePermissions('quotation.approve')
  reject(@Param('id') id: string, @Body() dto: RejectQuotationDto, @CurrentUser() actor: RequestUser) {
    return this.quotations.reject(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('quotation.delete')
  remove(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.quotations.remove(id, actor.id);
  }
}
