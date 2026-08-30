import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { FreightAllocationMethod } from '@prisma/client';
import { SIZE_OPTIONS } from '../../quotation-engine/sqft-dimensions.strategy';

class PurchaseInvoiceItemDto {
  @IsString()
  productId!: string;

  /**
   * When dimensional fields are supplied, quantity is the number of pieces and the server
   * calculates the stock quantity in square feet. Older integrations may continue sending only
   * quantity, in which case it is treated as the already-calculated square-foot quantity.
   */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsIn(SIZE_OPTIONS)
  sizeOption?: (typeof SIZE_OPTIONS)[number];

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
  unitCost!: number;
}

export class CreatePurchaseInvoiceDto {
  @IsString()
  supplierId!: string;

  @IsString()
  locationId!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  invoiceDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freightCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherDirectCosts?: number;

  @IsOptional()
  @IsEnum(FreightAllocationMethod)
  freightAllocationMethod?: FreightAllocationMethod;

  /** Defaults to the goods subtotal — see docs/client-clarifications.md item 14. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  supplierPayableAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceItemDto)
  items!: PurchaseInvoiceItemDto[];
}
