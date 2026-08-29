import { Module } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { SupplierLedgerModule } from '../supplier-ledger/supplier-ledger.module';
import { PdfModule } from '../pdf/pdf.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [
    AuditModule,
    TransactionsModule,
    NumberingModule,
    CustomerLedgerModule,
    SupplierLedgerModule,
    PdfModule,
    CompanySettingsModule,
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
