import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { QuotationStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/pagination.dto';

const toDate = ({ value }: { value: unknown }) => (value ? new Date(value as string) : value);

export class ListQuotationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  /** Matches the quotation number or the customer's name (QTN-05). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateTo?: Date;
}
