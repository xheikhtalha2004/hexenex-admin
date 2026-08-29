import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';

@Controller('suppliers')
@RequirePermissions('supplier.view')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Query() query: ListSuppliersQueryDto) {
    return this.suppliers.list(query);
  }

  @Get('picker')
  listForPicker() {
    return this.suppliers.listActiveForPicker();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliers.findOrThrow(id);
  }

  @Post()
  @RequirePermissions('supplier.manage')
  create(@Body() dto: CreateSupplierDto, @CurrentUser() actor: RequestUser) {
    return this.suppliers.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('supplier.manage')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() actor: RequestUser) {
    return this.suppliers.update(id, dto, actor.id);
  }
}
