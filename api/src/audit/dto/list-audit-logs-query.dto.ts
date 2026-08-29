import { Transform } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

const toDate = ({ value }: { value: unknown }) => (value ? new Date(value as string) : value);

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateTo?: Date;
}
