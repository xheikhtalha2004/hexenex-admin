import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompanySettingsService } from './company-settings.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('company-settings')
export class CompanySettingsController {
  constructor(private readonly service: CompanySettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  @RequirePermissions('company_settings.manage')
  update(@Body() body: Prisma.CompanySettingsUpdateInput) {
    return this.service.update(body);
  }
}
