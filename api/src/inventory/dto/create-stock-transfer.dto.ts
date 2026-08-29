import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDate, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

class StockTransferItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;
}

export class CreateStockTransferDto {
  @IsString()
  fromLocationId!: string;

  @IsString()
  toLocationId!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transferDate?: Date;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items!: StockTransferItemDto[];
}
