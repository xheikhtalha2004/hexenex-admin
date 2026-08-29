import { Module } from '@nestjs/common';
import { SalesReturnsService } from './sales-returns.service';
import { SalesReturnsController } from './sales-returns.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { CostingModule } from '../costing/costing.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { PdfModule } from '../pdf/pdf.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [
    AuditModule,
    TransactionsModule,
    NumberingModule,
    CostingModule,
    CustomerLedgerModule,
    PdfModule,
    CompanySettingsModule,
  ],
  controllers: [SalesReturnsController],
  providers: [SalesReturnsService],
  exports: [SalesReturnsService],
})
export class SalesReturnsModule {}
