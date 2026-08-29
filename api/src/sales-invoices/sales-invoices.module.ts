import { Module } from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoicesController } from './sales-invoices.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { CostingModule } from '../costing/costing.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [AuditModule, TransactionsModule, NumberingModule, CostingModule, CompanySettingsModule, CustomerLedgerModule, PdfModule],
  controllers: [SalesInvoicesController],
  providers: [SalesInvoicesService],
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
