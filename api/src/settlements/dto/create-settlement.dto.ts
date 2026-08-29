import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateSettlementDto {
  @IsString()
  customerId!: string;

  @IsString()
  supplierId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  /** Client-generated (e.g. a UUID) so a retried/double-clicked submission can't double-process. */
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  settlementDate?: Date;
}
