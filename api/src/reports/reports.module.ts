import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ExcelService } from './excel.service';
import { ReportsController } from './reports.controller';
import { PdfModule } from '../pdf/pdf.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';

@Module({
  imports: [PdfModule, CompanySettingsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExcelService],
})
export class ReportsModule {}
