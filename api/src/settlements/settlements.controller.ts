import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SettlementsService } from './settlements.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { ListSettlementsQueryDto } from './dto/list-settlements-query.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { settlementReceiptHtml } from '../pdf/templates/payment-receipt.template';

@Controller('settlements')
@RequirePermissions('settlement.view')
export class SettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  @Get()
  list(@Query() query: ListSettlementsQueryDto) {
    return this.settlements.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.settlements.findOrThrow(id);
  }

  @Get(':id/pdf')
  async pdfDownload(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [settlement, company] = await Promise.all([
      this.settlements.findOrThrow(id),
      this.companySettings.get(),
    ]);
    const html = this.pdf.renderHtml(settlementReceiptHtml(
      {
        documentNumber: settlement.settlementNumber,
        amount: settlement.amount,
        customerName: settlement.customer.name,
        supplierName: settlement.supplier.name,
        remarks: settlement.remarks,
        settlementDate: settlement.settlementDate,
      },
      company,
    ));
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }

  @Post()
  @RequirePermissions('settlement.create')
  create(@Body() dto: CreateSettlementDto, @CurrentUser() actor: RequestUser) {
    return this.settlements.create(dto, actor.id);
  }
}
