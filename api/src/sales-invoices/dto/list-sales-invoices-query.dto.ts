import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { SalesInvoiceStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/pagination.dto';

const toDate = ({ value }: { value: unknown }) => (value ? new Date(value as string) : value);

export class ListSalesInvoicesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(SalesInvoiceStatus)
  status?: SalesInvoiceStatus;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateTo?: Date;
}
