import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class SalesInvoiceItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  inputParameters?: any;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  rate!: number;
}

export class CreateSalesInvoiceDto {
  @IsString()
  customerId!: string;

  @IsString()
  locationId!: string;

  @IsOptional()
  @IsString()
  termsText?: string;

  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expectedDeliveryDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  sourceQuotationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceItemDto)
  items!: SalesInvoiceItemDto[];
}
