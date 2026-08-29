import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { PermissionsService } from './permissions.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { SetUserPermissionOverrideDto } from './dto/set-user-permission-override.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';

@Controller('users')
@RequirePermissions('user.manage')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: UserStatus) {
    return this.usersService.updateStatus(id, status);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body('roleId') roleId: string) {
    return this.usersService.updateRole(id, roleId);
  }

  @Patch(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body('newPassword') newPassword: string) {
    return this.usersService.setPassword(id, newPassword);
  }

  @Post(':id/permission-overrides')
  @RequirePermissions('permissions.manage')
  setPermissionOverride(
    @Param('id') id: string,
    @Body() dto: SetUserPermissionOverrideDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.permissionsService.setUserPermissionOverride(id, dto.permissionKey, dto.effect, actor.id);
  }
}
