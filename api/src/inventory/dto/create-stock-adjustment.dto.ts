import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { StockAdjustmentReason } from '@prisma/client';

class StockAdjustmentItemDto {
  @IsString()
  productId!: string;

  /** Signed: positive adds stock, negative removes it. Zero-delta items are ignored. */
  @IsNumber()
  quantityDelta!: number;

  @IsOptional()
  @IsNumber()
  unitCostOverride?: number;
}

export class CreateStockAdjustmentDto {
  @IsString()
  locationId!: string;

  @IsEnum(StockAdjustmentReason)
  reason!: StockAdjustmentReason;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  adjustmentDate?: Date;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsBoolean()
  postToTransactionLedger?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items!: StockAdjustmentItemDto[];
}
