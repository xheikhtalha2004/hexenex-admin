import { IsEmail, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  /** Signed: positive means the factory already owes this much as of creation. */
  @IsOptional()
  @IsNumber()
  openingBalance?: number;
}
