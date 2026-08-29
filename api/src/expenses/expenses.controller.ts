import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';

@Controller()
@RequirePermissions('expense.view')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get('expense-categories')
  listCategories() {
    return this.expenses.listCategories();
  }

  @Post('expense-categories')
  @RequirePermissions('expense.create')
  createCategory(@Body() dto: CreateExpenseCategoryDto, @CurrentUser() actor: RequestUser) {
    return this.expenses.createCategory(dto, actor.id);
  }

  @Patch('expense-categories/:id')
  @RequirePermissions('expense.create')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto, @CurrentUser() actor: RequestUser) {
    return this.expenses.updateCategory(id, dto, actor.id);
  }

  @Get('expenses')
  list(@Query() query: ListExpensesQueryDto) {
    return this.expenses.list(query);
  }

  @Get('expenses/:id')
  findOne(@Param('id') id: string) {
    return this.expenses.findOrThrow(id);
  }

  @Post('expenses')
  @RequirePermissions('expense.create')
  create(@Body() dto: CreateExpenseDto, @CurrentUser() actor: RequestUser) {
    return this.expenses.create(dto, actor.id);
  }
}
