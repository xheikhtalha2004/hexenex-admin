import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateCustomerPaymentDto {
  @IsString()
  customerId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  /** Required when paymentMethod is BANK_TRANSFER — the specific bank account the money
   * landed in (LED-07). Ignored for Cash/Cheque, which always post to their own account. */
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
