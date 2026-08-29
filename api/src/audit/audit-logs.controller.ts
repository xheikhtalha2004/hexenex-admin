import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@Controller('audit-logs')
@RequirePermissions('audit_log.view')
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.audit.list(query);
  }

  @Get('entity-types')
  entityTypes() {
    return this.audit.distinctEntityTypes();
  }
}
