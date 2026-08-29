import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

@Controller('roles')
@RequirePermissions('role.manage')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  list() {
    return this.rolesService.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto.name, dto.description);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.rolesService.delete(id);
  }

  @Put(':id/permissions')
  @RequirePermissions('permissions.manage')
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.permissionsService.setRolePermissions(id, dto.permissionKeys);
  }
}
