import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { UsersController } from './users.controller';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';

@Module({
  controllers: [UsersController, RolesController, PermissionsController],
  providers: [UsersService, RolesService, PermissionsService],
  exports: [UsersService, RolesService, PermissionsService],
})
export class IamModule {}
