import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CustomerPaymentsService } from './customer-payments.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { ListCustomerPaymentsQueryDto } from './dto/list-customer-payments-query.dto';
import { PdfService } from '../pdf/pdf.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { paymentReceiptHtml } from '../pdf/templates/payment-receipt.template';

@Controller('customer-payments')
@RequirePermissions('customer_ledger.view')
export class CustomerPaymentsController {
  constructor(
    private readonly customerPayments: CustomerPaymentsService,
    private readonly pdf: PdfService,
    private readonly companySettings: CompanySettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query() query: ListCustomerPaymentsQueryDto) {
    return this.customerPayments.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerPayments.findOrThrow(id);
  }

  @Get(':id/pdf')
  @RequirePermissions('receipt_voucher.print')
  async pdfDownload(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [payment, company, ledgerEntry] = await Promise.all([
      this.customerPayments.findOrThrow(id),
      this.companySettings.get(),
      this.prisma.customerLedgerEntry.findFirst({
        where: { customerPaymentId: id },
      }),
    ]);
    const html = this.pdf.renderHtml(paymentReceiptHtml(
      {
        documentNumber: payment.paymentNumber,
        title: 'Payment Receipt',
        partyLabel: 'Received From',
        partyName: payment.customer.name,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        referenceNo: payment.referenceNo,
        remarks: payment.remarks,
        paymentDate: payment.paymentDate,
        // amount is what was received; the ledger entry posts it as a negative (balance-reducing)
        // movement, so balanceAfter + amount recovers the balance immediately before this payment.
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
  @RequirePermissions('customer_payment.create')
  create(
    @Body() dto: CreateCustomerPaymentDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.customerPayments.create(dto, actor.id);
  }
}
