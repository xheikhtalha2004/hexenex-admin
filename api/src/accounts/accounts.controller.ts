import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { AddCashDto } from './dto/add-cash.dto';
import { TransferFundsDto } from './dto/transfer-funds.dto';

@Controller('accounts')
@RequirePermissions('accounts.view')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list() {
    return this.accounts.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accounts.findOrThrow(id);
  }

  @Get(':id/transactions')
  transactions(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.accounts.transactionHistory(
      id,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Post()
  @RequirePermissions('accounts.manage')
  createBankAccount(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.accounts.createBankAccount(dto, actor.id);
  }

  @Post('cash/add')
  @RequirePermissions('accounts.manage')
  addCash(@Body() dto: AddCashDto, @CurrentUser() actor: RequestUser) {
    return this.accounts.addCash(dto, actor.id);
  }

  @Post('transfer')
  @RequirePermissions('accounts.manage')
  transferFunds(
    @Body() dto: TransferFundsDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.accounts.transferFunds(dto, actor.id);
  }
}
