import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class AddCashDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  entryDate?: Date;
}
