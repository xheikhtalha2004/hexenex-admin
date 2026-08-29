import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentType,
  FreightAllocationMethod,
  MovementSourceType,
  MovementType,
  Prisma,
  PurchaseInvoiceStatus,
  SupplierLedgerEntryType,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { CostingStrategyRegistry } from '../costing/costing-strategy.registry';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { SupplierLedgerService } from '../supplier-ledger/supplier-ledger.service';
import { paginate } from '../common/pagination.dto';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly costingRegistry: CostingStrategyRegistry,
    private readonly companySettings: CompanySettingsService,
    private readonly supplierLedger: SupplierLedgerService,
  ) {}

  async list(query: ListPurchasesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PurchaseInvoiceWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo ? { invoiceDate: { gte: query.dateFrom, lte: query.dateTo } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where,
        include: { supplier: true, location: true, items: { include: { product: true } } },
        orderBy: { invoiceDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOrThrow(id: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id },
      include: { supplier: true, location: true, items: { include: { product: true } } },
    });
    if (!invoice) throw new NotFoundException('Purchase invoice not found');
    return invoice;
  }

  async create(dto: CreatePurchaseInvoiceDto, actorId: string) {
    const settings = await this.companySettings.get();
    const freightAllocationMethod = dto.freightAllocationMethod ?? settings.freightAllocationDefault;
    const freightCost = new Prisma.Decimal(dto.freightCost ?? 0);
    const otherDirectCosts = new Prisma.Decimal(dto.otherDirectCosts ?? 0);

    const itemAmounts = dto.items.map((item) => new Prisma.Decimal(item.quantity).times(item.unitCost));
    const subtotal = itemAmounts.reduce((sum, amount) => sum.plus(amount), ZERO);
    const totalQuantity = dto.items.reduce((sum, item) => sum.plus(item.quantity), ZERO);

    if (subtotal.isZero() && !freightCost.isZero()) {
      throw new BadRequestException('Cannot allocate freight/other costs when the goods subtotal is zero');
    }

    const supplierPayableAmount = new Prisma.Decimal(dto.supplierPayableAmount ?? subtotal);

    return this.prisma.$transaction(async (tx) => {
      await tx.supplier.findUniqueOrThrow({ where: { id: dto.supplierId } });
      await tx.location.findUniqueOrThrow({ where: { id: dto.locationId } });

      const purchaseInvoiceNumber = await this.numbering.nextNumber(tx, DocumentType.PURCHASE_INVOICE);

      const invoice = await tx.purchaseInvoice.create({
        data: {
          purchaseInvoiceNumber,
          supplierId: dto.supplierId,
          locationId: dto.locationId,
          invoiceDate: dto.invoiceDate ?? new Date(),
          status: PurchaseInvoiceStatus.DRAFT,
          freightCost,
          otherDirectCosts,
          freightAllocationMethod,
          subtotal,
          supplierPayableAmount,
          createdByUserId: actorId,
        },
      });

      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        const amount = itemAmounts[i];
        const quantity = new Prisma.Decimal(item.quantity);

        const shareBasis =
          freightAllocationMethod === FreightAllocationMethod.BY_QUANTITY
            ? totalQuantity.isZero()
              ? ZERO
              : quantity.dividedBy(totalQuantity)
            : subtotal.isZero()
              ? ZERO
              : amount.dividedBy(subtotal);

        const allocatedFreight = freightCost.times(shareBasis);
        const allocatedOtherCost = otherDirectCosts.times(shareBasis);
        const landedUnitCost = new Prisma.Decimal(item.unitCost).plus(allocatedFreight.plus(allocatedOtherCost).dividedBy(quantity));

        await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: invoice.id,
            productId: item.productId,
            quantity,
            unitCost: item.unitCost,
            amount,
            allocatedFreight,
            allocatedOtherCost,
            landedUnitCost,
          },
        });
      }

      await this.audit.log(
        { userId: actorId, action: 'CREATE', entityType: 'PurchaseInvoice', entityId: invoice.id, afterData: { ...invoice, items: dto.items } },
        tx,
      );

      return tx.purchaseInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { supplier: true, location: true, items: { include: { product: true } } },
      });
    });
  }

  async finalize(id: string, actorId: string) {
    const strategy = await this.costingRegistry.resolve();

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!invoice) throw new NotFoundException('Purchase invoice not found');
      if (invoice.status !== PurchaseInvoiceStatus.DRAFT) {
        throw new ConflictException(`Purchase invoice is already ${invoice.status.toLowerCase()}`);
      }

      for (const item of invoice.items) {
        await strategy.recordReceipt(tx, {
          productId: item.productId,
          locationId: invoice.locationId,
          quantity: item.quantity,
          unitCost: item.landedUnitCost,
          purchaseInvoiceItemId: item.id,
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: invoice.locationId,
            movementType: MovementType.PURCHASE,
            quantity: item.quantity,
            unitCost: item.landedUnitCost,
            movementDate: invoice.invoiceDate,
            sourceType: MovementSourceType.PURCHASE_INVOICE,
            purchaseInvoiceItemId: item.id,
            createdByUserId: actorId,
          },
        });

        await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: item.productId, locationId: invoice.locationId } },
          create: { productId: item.productId, locationId: invoice.locationId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
      }

      const ledgerEntry = await this.supplierLedger.postEntry(tx, {
        supplierId: invoice.supplierId,
        entryType: SupplierLedgerEntryType.PURCHASE,
        amount: invoice.supplierPayableAmount,
        purchaseInvoiceId: invoice.id,
        description: `Purchase invoice ${invoice.purchaseInvoiceNumber}`,
        entryDate: invoice.invoiceDate,
        createdByUserId: actorId,
      });

      await this.transactions.record(tx, {
        transactionType: TransactionType.PURCHASE_INVOICE,
        amount: invoice.supplierPayableAmount,
        description: `Purchase invoice ${invoice.purchaseInvoiceNumber}`,
        referenceType: 'PurchaseInvoice',
        referenceId: invoice.id,
        supplierId: invoice.supplierId,
        createdByUserId: actorId,
        transactionDate: invoice.invoiceDate,
      });

      const finalized = await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { status: PurchaseInvoiceStatus.FINALIZED, finalizedAt: new Date(), finalizedByUserId: actorId },
        include: { supplier: true, location: true, items: { include: { product: true } } },
      });

      await this.audit.log(
        {
          userId: actorId,
          action: 'FINALIZE',
          entityType: 'PurchaseInvoice',
          entityId: invoice.id,
          afterData: { status: 'FINALIZED', supplierLedgerEntryId: ledgerEntry.id },
        },
        tx,
      );

      return finalized;
    });
  }
}
