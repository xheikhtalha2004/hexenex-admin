import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

export interface RecordTransactionParams {
  transactionType: TransactionType;
  amount: Prisma.Decimal | number | string;
  description: string;
  referenceType: string;
  referenceId: string;
  customerId?: string | null;
  supplierId?: string | null;
  createdByUserId: string;
  transactionDate?: Date;
}

/**
 * Central, append-only index over every financial event (for the "all transactions"
 * report). Deliberately not authoritative and not FK-enforced — see schema header note.
 * Every domain module calls `record()` exactly once, inside its own `$transaction`,
 * as the last step of its atomic operation.
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: TxClient | PrismaService, params: RecordTransactionParams) {
    const client = tx ?? this.prisma;
    return client.transaction.create({
      data: {
        transactionType: params.transactionType,
        amount: params.amount,
        description: params.description,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        customerId: params.customerId ?? null,
        supplierId: params.supplierId ?? null,
        createdByUserId: params.createdByUserId,
        transactionDate: params.transactionDate ?? new Date(),
      },
    });
  }
}
