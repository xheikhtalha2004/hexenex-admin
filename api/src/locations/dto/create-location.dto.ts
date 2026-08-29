import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { LocationType } from '@prisma/client';

export class CreateLocationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(LocationType)
  type!: LocationType;

  @IsOptional()
  @IsString()
  address?: string;
}
