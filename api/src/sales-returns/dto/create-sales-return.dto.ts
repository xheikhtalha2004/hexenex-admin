import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { SIZE_OPTIONS } from '../../quotation-engine/sqft-dimensions.strategy';

class SalesReturnItemDto {
  @IsString()
  salesInvoiceItemId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** FIX / one of the standard widths / SELF — same options as the quotation sizing UI, so the
   * return line can be recorded the same way it was sold. */
  @IsOptional()
  @IsIn(SIZE_OPTIONS)
  sizeOption?: string;

  /** Piece count — informational only, never multiplies the rate directly. Amount is always
   * quantity (square feet) × rate. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  pieces?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  length?: number;

  /** What's actually usable after damage/edge-trimming, if different from width/length —
   * determines the square feet that are restored to stock and credited on the return. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  usableWidth?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  usableLength?: number;

  /** The final square feet for this line — computed client-side from the dimensions above (or
   * entered directly in SELF mode), same as the quotation engine. This is what the amount and
   * stock restoration are based on. */
  @IsNumber()
  @IsPositive()
  quantity!: number;
}

export class CreateSalesReturnDto {
  @IsString()
  salesInvoiceId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesReturnItemDto)
  items!: SalesReturnItemDto[];
}
