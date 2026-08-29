import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateSupplierPaymentDto {
  @IsString()
  supplierId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  /** Required when paymentMethod is BANK_TRANSFER (LED-07). */
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paymentDate?: Date;
}
