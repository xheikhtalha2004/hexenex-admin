import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { FreightAllocationMethod } from '@prisma/client';

class PurchaseInvoiceItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

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
