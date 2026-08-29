import { Module } from '@nestjs/common';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { SupplierAdvancesService } from './supplier-advances.service';
import { SupplierAdvancesController } from './supplier-advances.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { SupplierLedgerModule } from '../supplier-ledger/supplier-ledger.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { PdfModule } from '../pdf/pdf.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [AuditModule, TransactionsModule, NumberingModule, SupplierLedgerModule, CompanySettingsModule, PdfModule, AccountsModule],
  controllers: [SupplierPaymentsController, SupplierAdvancesController],
  providers: [SupplierPaymentsService, SupplierAdvancesService],
  exports: [SupplierPaymentsService, SupplierAdvancesService],
})
export class SupplierPaymentsModule {}
