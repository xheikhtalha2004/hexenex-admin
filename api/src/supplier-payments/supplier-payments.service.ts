import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentType,
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
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { ListSupplierPaymentsQueryDto } from './dto/list-supplier-payments-query.dto';

@Injectable()
export class SupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly supplierLedger: SupplierLedgerService,
    private readonly accounts: AccountsService,
  ) {}

  async list(query: ListSupplierPaymentsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SupplierPaymentWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.dateFrom || query.dateTo
        ? { paymentDate: { gte: query.dateFrom, lte: query.dateTo } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplierPayment.findMany({
        where,
        include: { supplier: true },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const payment = await this.prisma.supplierPayment.findUnique({
      where: { id },
      include: { supplier: true },
    });
    if (!payment) throw new NotFoundException('Supplier payment not found');
    return payment;
  }

  async create(dto: CreateSupplierPaymentDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.supplier.findUniqueOrThrow({ where: { id: dto.supplierId } });
      const accountId = await this.accounts.resolveAccountId(
        tx,
        dto.paymentMethod,
        dto.accountId,
      );

      const paymentNumber = await this.numbering.nextNumber(
        tx,
        DocumentType.SUPPLIER_PAYMENT_VOUCHER,
      );
      const payment = await tx.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId: dto.supplierId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          accountId,
          referenceNo: dto.referenceNo,
          remarks: dto.remarks,
          paymentDate: dto.paymentDate ?? new Date(),
          createdByUserId: actorId,
        },
      });

      await this.accounts.postTransaction(tx, {
        accountId,
        amount: new Prisma.Decimal(dto.amount).negated(),
        description: `Supplier payment ${paymentNumber} paid`,
        entryDate: payment.paymentDate,
        createdByUserId: actorId,
        supplierPaymentId: payment.id,
      });

      await this.supplierLedger.postEntry(tx, {
        supplierId: dto.supplierId,
        entryType: SupplierLedgerEntryType.PAYMENT,
        amount: new Prisma.Decimal(dto.amount).negated(),
        supplierPaymentId: payment.id,
        description: `Payment made — ${paymentNumber} (${dto.paymentMethod})${dto.referenceNo ? `, ref ${dto.referenceNo}` : ''}`,
        entryDate: payment.paymentDate,
        createdByUserId: actorId,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.SUPPLIER_PAYMENT,
        amount: new Prisma.Decimal(dto.amount).negated(),
        description: `Supplier payment ${paymentNumber}`,
        referenceType: 'SupplierPayment',
        referenceId: payment.id,
        supplierId: dto.supplierId,
        createdByUserId: actorId,
        transactionDate: payment.paymentDate,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'SupplierPayment',
          entityId: payment.id,
          afterData: payment,
        },
        tx,
      );

      return tx.supplierPayment.findUniqueOrThrow({
        where: { id: payment.id },
        include: { supplier: true },
      });
    });
  }
}
