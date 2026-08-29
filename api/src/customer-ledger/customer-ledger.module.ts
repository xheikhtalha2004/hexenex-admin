import { Module } from '@nestjs/common';
import { CustomerLedgerService } from './customer-ledger.service';
import { CustomerLedgerController } from './customer-ledger.controller';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [CompanySettingsModule, PdfModule],
  controllers: [CustomerLedgerController],
  providers: [CustomerLedgerService],
  exports: [CustomerLedgerService],
})
export class CustomerLedgerModule {}
