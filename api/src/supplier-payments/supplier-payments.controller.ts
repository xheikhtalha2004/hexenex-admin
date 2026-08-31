import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SupplierPaymentsService } from './supplier-payments.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { ListSupplierPaymentsQueryDto } from './dto/list-supplier-payments-query.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { paymentReceiptHtml } from '../pdf/templates/payment-receipt.template';

@Controller('supplier-payments')
@RequirePermissions('supplier_ledger.view')
export class SupplierPaymentsController {
  constructor(
    private readonly supplierPayments: SupplierPaymentsService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query() query: ListSupplierPaymentsQueryDto) {
    return this.supplierPayments.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supplierPayments.findOrThrow(id);
  }

  @Get(':id/pdf')
  async pdfDownload(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [payment, company, ledgerEntry] = await Promise.all([
      this.supplierPayments.findOrThrow(id),
      this.companySettings.get(),
      this.prisma.supplierLedgerEntry.findFirst({
        where: { supplierPaymentId: id },
      }),
    ]);
    const html = this.pdf.renderHtml(paymentReceiptHtml(
      {
        documentNumber: payment.paymentNumber,
        title: 'Payment Voucher',
        partyLabel: 'Paid To',
        partyName: payment.supplier.name,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        referenceNo: payment.referenceNo,
        remarks: payment.remarks,
        paymentDate: payment.paymentDate,
        ...(ledgerEntry
          ? {
              previousBalance: ledgerEntry.balanceAfter.plus(payment.amount),
              remainingBalance: ledgerEntry.balanceAfter,
            }
          : {}),
      },
      company,
    ));
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }

  @Post()
  @RequirePermissions('supplier_payment.create')
  create(
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.supplierPayments.create(dto, actor.id);
  }
}
