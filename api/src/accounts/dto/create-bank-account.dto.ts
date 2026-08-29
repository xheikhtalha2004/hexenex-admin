import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  openingBalance?: number;
}
