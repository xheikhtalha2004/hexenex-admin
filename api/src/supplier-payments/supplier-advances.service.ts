import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentType,
  PaymentMethod,
  Prisma,
  SupplierLedgerEntryType,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { SupplierLedgerService } from '../supplier-ledger/supplier-ledger.service';
import { AccountsService } from '../accounts/accounts.service';
import { paginate } from '../common/pagination.dto';
import { CreateSupplierAdvanceDto } from './dto/create-supplier-advance.dto';
import { ListSupplierAdvancesQueryDto } from './dto/list-supplier-advances-query.dto';

/**
 * An advance reduces the running payable the same way a payment does — it's money paid to
 * the supplier ahead of goods, so it must feed the SAME balance as regular payments (per the
 * master spec: "advances must be supported... must not corrupt supplier payable
 * calculations"). It's recorded under a distinct entryType only so statements/reports can
 * tell the two apart.
 */
@Injectable()
export class SupplierAdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly supplierLedger: SupplierLedgerService,
    private readonly accounts: AccountsService,
  ) {}

  async list(query: ListSupplierAdvancesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SupplierAdvanceWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplierAdvance.findMany({
        where,
        include: { supplier: true },
        orderBy: { advanceDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplierAdvance.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const advance = await this.prisma.supplierAdvance.findUnique({
      where: { id },
      include: { supplier: true },
    });
    if (!advance) throw new NotFoundException('Supplier advance not found');
    return advance;
  }

  async create(dto: CreateSupplierAdvanceDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.supplier.findUniqueOrThrow({ where: { id: dto.supplierId } });
      const paymentMethod = dto.paymentMethod ?? PaymentMethod.CASH;
      const accountId = await this.accounts.resolveAccountId(
        tx,
        paymentMethod,
        dto.accountId,
      );

      const advanceNumber = await this.numbering.nextNumber(
        tx,
        DocumentType.SUPPLIER_ADVANCE_VOUCHER,
      );
      const advance = await tx.supplierAdvance.create({
        data: {
          advanceNumber,
          supplierId: dto.supplierId,
          amount: dto.amount,
          paymentMethod,
          accountId,
          remarks: dto.remarks,
          advanceDate: dto.advanceDate ?? new Date(),
          createdByUserId: actorId,
        },
      });

      await this.accounts.postTransaction(tx, {
        accountId,
        amount: new Prisma.Decimal(dto.amount).negated(),
        description: `Supplier advance ${advanceNumber} paid`,
        entryDate: advance.advanceDate,
        createdByUserId: actorId,
        supplierAdvanceId: advance.id,
      });

      await this.supplierLedger.postEntry(tx, {
        supplierId: dto.supplierId,
        entryType: SupplierLedgerEntryType.ADVANCE,
        amount: new Prisma.Decimal(dto.amount).negated(),
        supplierAdvanceId: advance.id,
        description: `Advance paid — ${advanceNumber}`,
        entryDate: advance.advanceDate,
        createdByUserId: actorId,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.SUPPLIER_ADVANCE,
        amount: new Prisma.Decimal(dto.amount).negated(),
        description: `Supplier advance ${advanceNumber}`,
        referenceType: 'SupplierAdvance',
        referenceId: advance.id,
        supplierId: dto.supplierId,
        createdByUserId: actorId,
        transactionDate: advance.advanceDate,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'SupplierAdvance',
          entityId: advance.id,
          afterData: advance,
        },
        tx,
      );

      return tx.supplierAdvance.findUniqueOrThrow({
        where: { id: advance.id },
        include: { supplier: true },
      });
    });
  }
}
