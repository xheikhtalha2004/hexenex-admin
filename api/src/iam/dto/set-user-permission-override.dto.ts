import { IsEnum, IsString } from 'class-validator';
import { PermissionEffect } from '@prisma/client';

export class SetUserPermissionOverrideDto {
  @IsString()
  permissionKey!: string;

  @IsEnum(PermissionEffect)
  effect!: PermissionEffect;
}
