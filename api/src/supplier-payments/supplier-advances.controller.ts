import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SupplierAdvancesService } from './supplier-advances.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateSupplierAdvanceDto } from './dto/create-supplier-advance.dto';
import { ListSupplierAdvancesQueryDto } from './dto/list-supplier-advances-query.dto';

@Controller('supplier-advances')
@RequirePermissions('supplier_ledger.view')
export class SupplierAdvancesController {
  constructor(private readonly supplierAdvances: SupplierAdvancesService) {}

  @Get()
  list(@Query() query: ListSupplierAdvancesQueryDto) {
    return this.supplierAdvances.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supplierAdvances.findOrThrow(id);
  }

  @Post()
  @RequirePermissions('supplier_advance.create')
  create(@Body() dto: CreateSupplierAdvanceDto, @CurrentUser() actor: RequestUser) {
    return this.supplierAdvances.create(dto, actor.id);
  }
}
