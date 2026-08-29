import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { AccountsService } from '../accounts/accounts.service';
import { paginate } from '../common/pagination.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly accounts: AccountsService,
  ) {}

  listCategories(includeInactive = true) {
    return this.prisma.expenseCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto, actorId: string) {
    const existing = await this.prisma.expenseCategory.findUnique({
      where: { name: dto.name },
    });
    if (existing)
      throw new ConflictException(
        'An expense category with this name already exists',
      );

    const category = await this.prisma.expenseCategory.create({
      data: { name: dto.name },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'ExpenseCategory',
      entityId: category.id,
      afterData: category,
    });
    return category;
  }

  async updateCategory(
    id: string,
    dto: UpdateExpenseCategoryDto,
    actorId: string,
  ) {
    const before = await this.prisma.expenseCategory.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('Expense category not found');

    const after = await this.prisma.expenseCategory.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'ExpenseCategory',
      entityId: id,
      beforeData: before,
      afterData: after,
    });
    return after;
  }

  async list(query: ListExpensesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ExpenseWhereInput = {
      ...(query.expenseCategoryId
        ? { expenseCategoryId: query.expenseCategoryId }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? { expenseDate: { gte: query.dateFrom, lte: query.dateTo } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: true },
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async create(dto: CreateExpenseDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.expenseCategory.findUniqueOrThrow({
        where: { id: dto.expenseCategoryId },
      });
      const accountId = await this.accounts.resolveAccountId(
        tx,
        dto.paymentMethod,
        dto.accountId,
      );

      const expenseNumber = await this.numbering.nextNumber(
        tx,
        DocumentType.EXPENSE,
      );
      const expense = await tx.expense.create({
        data: {
          expenseNumber,
          expenseCategoryId: dto.expenseCategoryId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          accountId,
          payee: dto.payee,
          remarks: dto.remarks,
          expenseDate: dto.expenseDate ?? new Date(),
          createdByUserId: actorId,
        },
      });

      await this.accounts.postTransaction(tx, {
        accountId,
        amount: new Prisma.Decimal(dto.amount).negated(),
        description: `Expense ${expenseNumber}${dto.payee ? ` — ${dto.payee}` : ''}`,
        entryDate: expense.expenseDate,
        createdByUserId: actorId,
        expenseId: expense.id,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.EXPENSE,
        amount: dto.amount,
        description: `Expense ${expenseNumber}${dto.payee ? ` — ${dto.payee}` : ''}`,
        referenceType: 'Expense',
        referenceId: expense.id,
        createdByUserId: actorId,
        transactionDate: expense.expenseDate,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'Expense',
          entityId: expense.id,
          afterData: expense,
        },
        tx,
      );

      return tx.expense.findUniqueOrThrow({
        where: { id: expense.id },
        include: { category: true },
      });
    });
  }
}
