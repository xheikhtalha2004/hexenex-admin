import { Injectable } from '@nestjs/common';
import { DocumentType, Prisma, SequenceResetPolicy } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

/**
 * Sequential, gap-free document numbering. The increment happens via a Prisma
 * `update` (not read-then-write), so Postgres's row lock on the UPDATE serializes
 * concurrent callers — two transactions incrementing the same sequence cannot both
 * "win" the same number, one blocks until the other commits/rolls back.
 *
 * Always call with the same `tx` the caller's document insert runs in, so the
 * number and the document are assigned atomically.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async nextNumber(tx: TxClient | PrismaService, documentType: DocumentType): Promise<string> {
    const client = tx ?? this.prisma;
    const periodKey = await this.resolvePeriodKey(client, documentType);

    const sequence = await client.documentNumberSequence.upsert({
      where: { documentType_periodKey: { documentType, periodKey } },
      create: {
        documentType,
        periodKey,
        currentNumber: 1,
        prefix: DEFAULT_PREFIXES[documentType],
      },
      update: {
        currentNumber: { increment: 1 },
      },
    });

    return this.format(sequence.prefix ?? DEFAULT_PREFIXES[documentType], periodKey, sequence.currentNumber);
  }

  private async resolvePeriodKey(client: TxClient | PrismaService, documentType: DocumentType): Promise<string> {
    const existing = await client.documentNumberSequence.findFirst({ where: { documentType } });
    const resetPolicy = existing?.resetPolicy ?? SequenceResetPolicy.NEVER;
    if (resetPolicy === SequenceResetPolicy.YEARLY) {
      return String(new Date().getFullYear());
    }
    return 'ALL';
  }

  private format(prefix: string | null, periodKey: string, currentNumber: number): string {
    const padded = String(currentNumber).padStart(6, '0');
    const parts = [prefix, periodKey !== 'ALL' ? periodKey : null, padded].filter(Boolean);
    return parts.join('-');
  }
}

const DEFAULT_PREFIXES: Record<DocumentType, string> = {
  SALES_INVOICE: 'SI',
  SALES_RETURN: 'SR',
  PURCHASE_INVOICE: 'PI',
  QUOTATION: 'QT',
  CUSTOMER_RECEIPT_VOUCHER: 'CRV',
  SUPPLIER_PAYMENT_VOUCHER: 'SPV',
  SUPPLIER_ADVANCE_VOUCHER: 'SAV',
  SETTLEMENT: 'STL',
  STOCK_TRANSFER: 'STF',
  STOCK_ADJUSTMENT: 'ADJ',
  EXPENSE: 'EXP',
};
