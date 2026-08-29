import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CustomerLedgerEntryType,
  DocumentType,
  Prisma,
  SupplierLedgerEntryType,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { SupplierLedgerService } from '../supplier-ledger/supplier-ledger.service';
import { paginate } from '../common/pagination.dto';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { ListSettlementsQueryDto } from './dto/list-settlements-query.dto';

const INCLUDE = {
  customer: true,
  supplier: true,
  customerLedgerEntry: true,
  supplierLedgerEntry: true,
};

/**
 * The client's highest-priority feature: a customer pays a supplier directly on the
 * factory's behalf. This is the one place in the system where a single user action must
 * touch BOTH a customer's receivable and a supplier's payable atomically — the exact failure
 * mode the client described (recording the customer side but forgetting the supplier side)
 * is what this module exists to make structurally impossible.
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly supplierLedger: SupplierLedgerService,
  ) {}

  async list(query: ListSettlementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CustomerSupplierSettlementWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.dateFrom || query.dateTo
        ? { settlementDate: { gte: query.dateFrom, lte: query.dateTo } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.customerSupplierSettlement.findMany({
        where,
        include: INCLUDE,
        orderBy: { settlementDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerSupplierSettlement.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const settlement = await this.prisma.customerSupplierSettlement.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
  }

  /**
   * Idempotent by `idempotencyKey`: a retried/double-submitted request with the same key
   * returns the original settlement rather than creating a second one. The pre-check handles
   * the common case; the DB's unique constraint on `idempotencyKey` is the final guard against
   * a genuine race (two near-simultaneous requests with the same key) — if the insert loses
   * that race, we catch the unique-violation and return the winner's row instead of erroring.
   */
  async create(dto: CreateSettlementDto, actorId: string) {
    const existing = await this.prisma.customerSupplierSettlement.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: INCLUDE,
    });
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: dto.customerId },
        });
        const supplier = await tx.supplier.findUniqueOrThrow({
          where: { id: dto.supplierId },
        });
        const settlementDate = dto.settlementDate ?? new Date();

        // Pre-generated so the Transaction row below can reference the settlement's real id
        // (consistent with every other module's convention), even though the settlement row
        // itself isn't created until after the transaction — it depends on transactionId.
        const settlementId = randomUUID();
        const settlementNumber = await this.numbering.nextNumber(
          tx,
          DocumentType.SETTLEMENT,
        );

        // Descriptions deliberately omit the counterparty's name — it's carried once in
        // `counterpartyLabel` and rendered in bold by the statement template. Putting it in both
        // places was printing the name twice on the same line (e.g. "...paid to supplier Acme
        // Traders (Acme Traders)"). "Payment" (not "Settlement") is used on the customer side
        // only — the client found "Settlement" confusing on customer-facing documents; the
        // supplier side keeps the internal terminology since a supplier isn't a customer.
        const customerLedgerEntry = await this.customerLedger.postEntry(tx, {
          customerId: dto.customerId,
          entryType: CustomerLedgerEntryType.SETTLEMENT,
          amount: new Prisma.Decimal(dto.amount).negated(),
          counterpartyLabel: supplier.name,
          description: `Payment ${settlementNumber} — paid to supplier`,
          entryDate: settlementDate,
          createdByUserId: actorId,
        });

        const supplierLedgerEntry = await this.supplierLedger.postEntry(tx, {
          supplierId: dto.supplierId,
          entryType: SupplierLedgerEntryType.SETTLEMENT,
          amount: new Prisma.Decimal(dto.amount).negated(),
          counterpartyLabel: customer.name,
          description: `Settlement ${settlementNumber} — paid by customer`,
          entryDate: settlementDate,
          createdByUserId: actorId,
        });

        const transaction = await this.transactions.record(tx, {
          transactionType: TransactionType.CROSS_SETTLEMENT,
          amount: dto.amount,
          description: `${customer.name} paid ${supplier.name} on the factory's behalf (${settlementNumber})`,
          referenceType: 'CustomerSupplierSettlement',
          referenceId: settlementId,
          customerId: dto.customerId,
          supplierId: dto.supplierId,
          createdByUserId: actorId,
          transactionDate: settlementDate,
        });

        const settlement = await tx.customerSupplierSettlement.create({
          data: {
            id: settlementId,
            settlementNumber,
            customerId: dto.customerId,
            supplierId: dto.supplierId,
            amount: dto.amount,
            remarks: dto.remarks,
            idempotencyKey: dto.idempotencyKey,
            settlementDate,
            createdByUserId: actorId,
            customerLedgerEntryId: customerLedgerEntry.id,
            supplierLedgerEntryId: supplierLedgerEntry.id,
            transactionId: transaction.id,
          },
        });

        await this.audit.log(
          {
            userId: actorId,
            action: 'CREATE',
            entityType: 'CustomerSupplierSettlement',
            entityId: settlement.id,
            afterData: settlement,
          },
          tx,
        );

        return tx.customerSupplierSettlement.findUniqueOrThrow({
          where: { id: settlement.id },
          include: INCLUDE,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.customerSupplierSettlement.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: INCLUDE,
        });
        if (winner) return winner;
      }
      throw error;
    }
  }
}
