import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';

@Controller('customers')
@RequirePermissions('customer.view')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.list(query);
  }

  @Get('picker')
  listForPicker() {
    return this.customers.listActiveForPicker();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOrThrow(id);
  }

  @Post()
  @RequirePermissions('customer.manage')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: RequestUser) {
    return this.customers.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('customer.manage')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() actor: RequestUser) {
    return this.customers.update(id, dto, actor.id);
  }
}
