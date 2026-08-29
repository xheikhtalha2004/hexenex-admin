import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerLedgerEntryType, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { paginate } from '../common/pagination.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly customerLedger: CustomerLedgerService,
  ) {}

  async list(query: ListCustomersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CustomerWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  /** Flat, unpaginated list of active customers — for pickers (invoices, settlements), not browsing. */
  listActiveForPicker() {
    return this.prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateCustomerDto, actorId: string) {
    const customer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { name: dto.name, phone: dto.phone, email: dto.email, address: dto.address },
      });

      if (dto.openingBalance && dto.openingBalance !== 0) {
        const entry = await this.customerLedger.postEntry(tx, {
          customerId: created.id,
          entryType: CustomerLedgerEntryType.OPENING_BALANCE,
          amount: dto.openingBalance,
          description: 'Opening balance',
          createdByUserId: actorId,
        });
        await this.transactions.record(tx, {
          transactionType: TransactionType.OPENING_BALANCE,
          amount: dto.openingBalance,
          description: `Opening balance for ${created.name}`,
          referenceType: 'CustomerLedgerEntry',
          referenceId: entry.id,
          customerId: created.id,
          createdByUserId: actorId,
        });
      }

      await this.audit.log(
        { userId: actorId, action: 'CREATE', entityType: 'Customer', entityId: created.id, afterData: created },
        tx,
      );

      return tx.customer.findUniqueOrThrow({ where: { id: created.id } });
    });

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, actorId: string) {
    const before = await this.findOrThrow(id);
    const after = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entityType: 'Customer', entityId: id, beforeData: before, afterData: after });
    return after;
  }
}
