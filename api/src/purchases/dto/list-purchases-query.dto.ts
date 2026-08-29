import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/pagination.dto';

const toDate = ({ value }: { value: unknown }) => (value ? new Date(value as string) : value);

export class ListPurchasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsEnum(PurchaseInvoiceStatus)
  status?: PurchaseInvoiceStatus;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateTo?: Date;
}
