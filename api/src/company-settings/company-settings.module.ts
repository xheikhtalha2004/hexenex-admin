import { Module } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import { CompanySettingsController } from './company-settings.controller';

@Module({
  providers: [CompanySettingsService],
  controllers: [CompanySettingsController],
  exports: [CompanySettingsService],
})
export class CompanySettingsModule {}
