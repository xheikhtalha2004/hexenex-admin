import { Injectable } from '@nestjs/common';
import { Prisma, SupplierLedgerEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

export interface PostSupplierLedgerEntryParams {
  supplierId: string;
  entryType: SupplierLedgerEntryType;
  /** Signed: positive increases the payable to the supplier, negative decreases it. */
  amount: Prisma.Decimal | number | string;
  counterpartyLabel?: string;
  purchaseInvoiceId?: string;
  supplierPaymentId?: string;
  supplierAdvanceId?: string;
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
 * The ONLY code path allowed to change `Supplier.currentBalance` — mirrors
 * CustomerLedgerService. Every module affecting a supplier's payable (purchases, payments,
 * advances, settlements) must call `postEntry` inside its own `$transaction`.
 */
@Injectable()
export class SupplierLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postEntry(tx: TxClient, params: PostSupplierLedgerEntryParams) {
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: params.supplierId } });
    const amount = new Prisma.Decimal(params.amount);
    const balanceAfter = supplier.currentBalance.plus(amount);

    const entry = await tx.supplierLedgerEntry.create({
      data: {
        supplierId: params.supplierId,
        entryType: params.entryType,
        amount,
        balanceAfter,
        counterpartyLabel: params.counterpartyLabel,
        purchaseInvoiceId: params.purchaseInvoiceId,
        supplierPaymentId: params.supplierPaymentId,
        supplierAdvanceId: params.supplierAdvanceId,
        description: params.description,
        entryDate: params.entryDate ?? new Date(),
        createdByUserId: params.createdByUserId,
      },
    });

    await tx.supplier.update({ where: { id: params.supplierId }, data: { currentBalance: balanceAfter } });

    return entry;
  }

  async getStatement(supplierId: string, query: StatementQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.SupplierLedgerEntryWhereInput = {
      supplierId,
      ...(query.dateFrom || query.dateTo
        ? { entryDate: { gte: query.dateFrom, lte: query.dateTo } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplierLedgerEntry.findMany({
        where,
        orderBy: { entryDate: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplierLedgerEntry.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
