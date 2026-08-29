import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { AuditModule } from '../audit/audit.module';
import { NumberingModule } from '../numbering/numbering.module';
import { QuotationEngineModule } from '../quotation-engine/quotation-engine.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [AuditModule, NumberingModule, QuotationEngineModule, CompanySettingsModule, PdfModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
