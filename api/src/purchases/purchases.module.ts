import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { CostingModule } from '../costing/costing.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { SupplierLedgerModule } from '../supplier-ledger/supplier-ledger.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [
    AuditModule,
    TransactionsModule,
    NumberingModule,
    CostingModule,
    CompanySettingsModule,
    SupplierLedgerModule,
    PdfModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
