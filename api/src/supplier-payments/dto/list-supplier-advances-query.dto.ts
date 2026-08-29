import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class ListSupplierAdvancesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  supplierId?: string;
}
