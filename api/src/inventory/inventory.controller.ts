import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { ListBalancesQueryDto } from './dto/list-balances-query.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';

@Controller('inventory')
@RequirePermissions('inventory.view')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  getBalances(@Query() query: ListBalancesQueryDto) {
    return this.inventory.getBalances(query);
  }

  @Get('low-stock')
  getLowStock(@Query() query: ListBalancesQueryDto) {
    return this.inventory.getBalances({ ...query, lowStockOnly: true, negativeStockOnly: false });
  }

  @Get('negative-stock')
  getNegativeStock(@Query() query: ListBalancesQueryDto) {
    return this.inventory.getBalances({ ...query, lowStockOnly: false, negativeStockOnly: true });
  }

  @Get('movements')
  getMovementHistory(@Query() query: ListMovementsQueryDto) {
    return this.inventory.getMovementHistory(query);
  }

  @Post('transfers')
  @RequirePermissions('stock_transfer.create')
  transferStock(@Body() dto: CreateStockTransferDto, @CurrentUser() actor: RequestUser) {
    return this.inventory.transferStock(dto, actor.id);
  }

  @Post('adjustments')
  @RequirePermissions('stock_adjustment.create')
  adjustStock(@Body() dto: CreateStockAdjustmentDto, @CurrentUser() actor: RequestUser) {
    return this.inventory.adjustStock(dto, actor.id);
  }
}
