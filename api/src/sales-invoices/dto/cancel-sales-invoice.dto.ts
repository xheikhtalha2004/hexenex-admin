import { IsOptional, IsString } from 'class-validator';

export class CancelSalesInvoiceDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
