import { Module } from '@nestjs/common';
import { CustomerPaymentsService } from './customer-payments.service';
import { CustomerPaymentsController } from './customer-payments.controller';
import { AuditModule } from '../audit/audit.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { NumberingModule } from '../numbering/numbering.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { PdfModule } from '../pdf/pdf.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [AuditModule, TransactionsModule, NumberingModule, CustomerLedgerModule, CompanySettingsModule, PdfModule, AccountsModule],
  controllers: [CustomerPaymentsController],
  providers: [CustomerPaymentsService],
  exports: [CustomerPaymentsService],
})
export class CustomerPaymentsModule {}
