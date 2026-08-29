import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerLedgerEntryType,
  DocumentType,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { AccountsService } from '../accounts/accounts.service';
import { paginate } from '../common/pagination.dto';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { ListCustomerPaymentsQueryDto } from './dto/list-customer-payments-query.dto';

@Injectable()
export class CustomerPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly customerLedger: CustomerLedgerService,
    private readonly accounts: AccountsService,
  ) {}

  async list(query: ListCustomerPaymentsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CustomerPaymentWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.dateFrom || query.dateTo
        ? { paymentDate: { gte: query.dateFrom, lte: query.dateTo } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.customerPayment.findMany({
        where,
        include: { customer: true },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerPayment.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const payment = await this.prisma.customerPayment.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!payment) throw new NotFoundException('Customer payment not found');
    return payment;
  }

  async create(dto: CreateCustomerPaymentDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.customer.findUniqueOrThrow({ where: { id: dto.customerId } });
      const accountId = await this.accounts.resolveAccountId(
        tx,
        dto.paymentMethod,
        dto.accountId,
      );

      const paymentNumber = await this.numbering.nextNumber(
        tx,
        DocumentType.CUSTOMER_RECEIPT_VOUCHER,
      );
      const payment = await tx.customerPayment.create({
        data: {
          paymentNumber,
          customerId: dto.customerId,
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
        amount: dto.amount,
        description: `Customer payment ${paymentNumber} received`,
        entryDate: payment.paymentDate,
        createdByUserId: actorId,
        customerPaymentId: payment.id,
      });

      await this.customerLedger.postEntry(tx, {
        customerId: dto.customerId,
        entryType: CustomerLedgerEntryType.PAYMENT,
        amount: new Prisma.Decimal(dto.amount).negated(),
        customerPaymentId: payment.id,
        description: `Payment received — ${paymentNumber} (${dto.paymentMethod})${dto.referenceNo ? `, ref ${dto.referenceNo}` : ''}`,
        entryDate: payment.paymentDate,
        createdByUserId: actorId,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.CUSTOMER_PAYMENT,
        amount: new Prisma.Decimal(dto.amount).negated(),
        description: `Customer payment ${paymentNumber}`,
        referenceType: 'CustomerPayment',
        referenceId: payment.id,
        customerId: dto.customerId,
        createdByUserId: actorId,
        transactionDate: payment.paymentDate,
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'CustomerPayment',
          entityId: payment.id,
          afterData: payment,
        },
        tx,
      );

      return tx.customerPayment.findUniqueOrThrow({
        where: { id: payment.id },
        include: { customer: true },
      });
    });
  }
}
