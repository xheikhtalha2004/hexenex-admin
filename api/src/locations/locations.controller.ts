import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list() {
    return this.locations.list();
  }

  @Post()
  @RequirePermissions('location.manage')
  create(@Body() dto: CreateLocationDto, @CurrentUser() actor: RequestUser) {
    return this.locations.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('location.manage')
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto, @CurrentUser() actor: RequestUser) {
    return this.locations.update(id, dto, actor.id);
  }
}
