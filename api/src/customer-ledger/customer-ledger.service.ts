import { Injectable } from '@nestjs/common';
import { CustomerLedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

export interface PostCustomerLedgerEntryParams {
  customerId: string;
  entryType: CustomerLedgerEntryType;
  /** Signed: positive increases the customer's receivable, negative decreases it. */
  amount: Prisma.Decimal | number | string;
  counterpartyLabel?: string;
  salesInvoiceId?: string;
  salesReturnId?: string;
  customerPaymentId?: string;
  description?: string;
  entryDate?: Date;
  createdByUserId: string;
}

export interface StatementQuery {
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * The ONLY code path allowed to change `Customer.currentBalance` — every module that
 * affects a customer's balance (sales invoices, returns, payments, settlements) must call
 * `postEntry` inside its own `$transaction`, never write `currentBalance` directly. This
 * keeps the cached balance and the append-only ledger mathematically impossible to diverge.
 */
@Injectable()
export class CustomerLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postEntry(tx: TxClient, params: PostCustomerLedgerEntryParams) {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: params.customerId } });
    const amount = new Prisma.Decimal(params.amount);
    const balanceAfter = customer.currentBalance.plus(amount);

    const entry = await tx.customerLedgerEntry.create({
      data: {
        customerId: params.customerId,
        entryType: params.entryType,
        amount,
        balanceAfter,
        counterpartyLabel: params.counterpartyLabel,
        salesInvoiceId: params.salesInvoiceId,
        salesReturnId: params.salesReturnId,
        customerPaymentId: params.customerPaymentId,
        description: params.description,
        entryDate: params.entryDate ?? new Date(),
        createdByUserId: params.createdByUserId,
      },
    });

    await tx.customer.update({ where: { id: params.customerId }, data: { currentBalance: balanceAfter } });

    return entry;
  }

  async getStatement(customerId: string, query: StatementQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.CustomerLedgerEntryWhereInput = {
      customerId,
      ...(query.dateFrom || query.dateTo
        ? { entryDate: { gte: query.dateFrom, lte: query.dateTo } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.customerLedgerEntry.findMany({
        where,
        orderBy: { entryDate: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerLedgerEntry.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
