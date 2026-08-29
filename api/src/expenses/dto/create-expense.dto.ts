import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @IsString()
  expenseCategoryId!: string;

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
  payee?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expenseDate?: Date;
}
