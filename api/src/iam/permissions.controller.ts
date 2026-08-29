import { Controller, Get } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('permissions')
@RequirePermissions('permissions.manage')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  list() {
    return this.permissionsService.listAll();
  }
}
