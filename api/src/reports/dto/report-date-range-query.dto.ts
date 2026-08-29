import { Transform } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

const toDate = ({ value }: { value: unknown }) => (value ? new Date(value as string) : value);

export class ReportDateRangeQueryDto {
  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  dateTo?: Date;
}
