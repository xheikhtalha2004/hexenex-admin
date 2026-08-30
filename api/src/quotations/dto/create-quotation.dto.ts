import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { SIZE_OPTIONS } from '../../quotation-engine/sqft-dimensions.strategy';

class QuotationItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Shape is strategy-defined. For the default SQFT_DIMENSIONS strategy: `sizeOption` picks
   * "FIX" (use the typed `width`), a standard inch width (e.g. "8"), or "SELF" (use the typed
   * `sqft` directly, ignoring quantity/width/length). Validated in full by the strategy itself
   * since which fields are required depends on the chosen mode.
   */
  @IsOptional()
  @IsIn(SIZE_OPTIONS)
  sizeOption?: (typeof SIZE_OPTIONS)[number];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  length?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  sqft?: number;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateQuotationDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  calculationProfileId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  advanceReceived?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}
