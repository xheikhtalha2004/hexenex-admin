import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class CreateFromQuotationDto {
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
}
