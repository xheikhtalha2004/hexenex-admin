import { Module } from '@nestjs/common';
import { SupplierLedgerService } from './supplier-ledger.service';
import { SupplierLedgerController } from './supplier-ledger.controller';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [CompanySettingsModule, PdfModule],
  controllers: [SupplierLedgerController],
  providers: [SupplierLedgerService],
  exports: [SupplierLedgerService],
})
export class SupplierLedgerModule {}
