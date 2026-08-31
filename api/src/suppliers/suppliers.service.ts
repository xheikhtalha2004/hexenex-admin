import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupplierLedgerEntryType, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SupplierLedgerService } from '../supplier-ledger/supplier-ledger.service';
import { paginate } from '../common/pagination.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly supplierLedger: SupplierLedgerService,
  ) {}

  async list(query: ListSuppliersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SupplierWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { phone: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  /** Flat, unpaginated list of active suppliers — for pickers (purchases, settlements), not browsing. */
  listActiveForPicker() {
    return this.prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateSupplierDto, actorId: string) {
    const supplier = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: { name: dto.name, phone: dto.phone, email: dto.email, address: dto.address },
      });

      if (dto.openingBalance && dto.openingBalance !== 0) {
        const entry = await this.supplierLedger.postEntry(tx, {
          supplierId: created.id,
          entryType: SupplierLedgerEntryType.OPENING_BALANCE,
          amount: dto.openingBalance,
          description: 'Opening balance',
          createdByUserId: actorId,
        });
        await this.transactions.record(tx, {
          transactionType: TransactionType.OPENING_BALANCE,
          amount: dto.openingBalance,
          description: `Opening balance for ${created.name}`,
          referenceType: 'SupplierLedgerEntry',
          referenceId: entry.id,
          supplierId: created.id,
          createdByUserId: actorId,
        });
      }

      await this.audit.log(
        { userId: actorId, action: 'CREATE', entityType: 'Supplier', entityId: created.id, afterData: created },
        tx,
      );

      return tx.supplier.findUniqueOrThrow({ where: { id: created.id } });
    });

    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, actorId: string) {
    const before = await this.findOrThrow(id);
    const after = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entityType: 'Supplier', entityId: id, beforeData: before, afterData: after });
    return after;
  }
}
