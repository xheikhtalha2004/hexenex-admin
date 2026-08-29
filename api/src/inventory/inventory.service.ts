import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentType, MovementSourceType, MovementType, Prisma, StockShortagePolicy, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NumberingService } from '../numbering/numbering.service';
import { CostingStrategyRegistry } from '../costing/costing-strategy.registry';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { paginate } from '../common/pagination.dto';
import { ListBalancesQueryDto } from './dto/list-balances-query.dto';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';

const ZERO = new Prisma.Decimal(0);

export interface InventoryBalanceRow {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  locationId: string;
  locationName: string;
  quantity: Prisma.Decimal;
  reorderLevel: Prisma.Decimal | null;
  isLowStock: boolean;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionsService,
    private readonly numbering: NumberingService,
    private readonly costingRegistry: CostingStrategyRegistry,
    private readonly companySettings: CompanySettingsService,
  ) {}

  /**
   * Builds the full product × location grid (including zero-stock combinations) rather than
   * only rows that happen to have an InventoryBalance record — a product that has never moved
   * still needs to show as "0 in stock" rather than being silently absent from the report.
   */
  async getBalances(query: ListBalancesQueryDto): Promise<InventoryBalanceRow[]> {
    const [products, locations, balances] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.productId ? { id: query.productId } : {}),
          ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
        },
        include: { category: true },
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      }),
      this.prisma.location.findMany({
        where: { isActive: true, ...(query.locationId ? { id: query.locationId } : {}) },
        orderBy: { name: 'asc' },
      }),
      this.prisma.inventoryBalance.findMany(),
    ]);

    const balanceMap = new Map(balances.map((b) => [`${b.productId}:${b.locationId}`, b.quantity]));

    const rows: InventoryBalanceRow[] = [];
    for (const product of products) {
      for (const location of locations) {
        const quantity = balanceMap.get(`${product.id}:${location.id}`) ?? ZERO;
        const isLowStock = product.reorderLevel != null && quantity.lessThan(product.reorderLevel);
        if (query.lowStockOnly && !isLowStock) continue;
        rows.push({
          productId: product.id,
          productName: product.name,
          categoryId: product.categoryId,
          categoryName: product.category.name,
          locationId: location.id,
          locationName: location.name,
          quantity,
          reorderLevel: product.reorderLevel,
          isLowStock,
        });
      }
    }
    return rows;
  }

  async getMovementHistory(query: ListMovementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.movementType ? { movementType: query.movementType } : {}),
      ...(query.dateFrom || query.dateTo ? { movementDate: { gte: query.dateFrom, lte: query.dateTo } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: { product: true, location: true },
        orderBy: { movementDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async transferStock(dto: CreateStockTransferDto, actorId: string) {
    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Source and destination location must be different');
    }
    const settings = await this.companySettings.get();
    const strategy = await this.costingRegistry.resolve();
    const transferDate = dto.transferDate ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.location.findUniqueOrThrow({ where: { id: dto.fromLocationId } });
      await tx.location.findUniqueOrThrow({ where: { id: dto.toLocationId } });

      const transferNumber = await this.numbering.nextNumber(tx, DocumentType.STOCK_TRANSFER);
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNumber,
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          status: 'COMPLETED',
          transferDate,
          remarks: dto.remarks,
          createdByUserId: actorId,
        },
      });

      for (const item of dto.items) {
        await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
        const quantity = new Prisma.Decimal(item.quantity);

        const fromBalance = await tx.inventoryBalance.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: dto.fromLocationId } },
        });
        const currentQty = fromBalance?.quantity ?? ZERO;
        if (settings.stockShortagePolicy === StockShortagePolicy.PREVENT_NEGATIVE && currentQty.lessThan(quantity)) {
          throw new BadRequestException(`Insufficient stock for product ${item.productId} at the source location`);
        }

        const transferItem = await tx.stockTransferItem.create({
          data: { stockTransferId: transfer.id, productId: item.productId, quantity },
        });

        const unitCost = await strategy.getCurrentUnitCost(tx, item.productId, dto.fromLocationId);

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: dto.fromLocationId,
            movementType: MovementType.TRANSFER_OUT,
            quantity: quantity.negated(),
            unitCost,
            movementDate: transferDate,
            sourceType: MovementSourceType.STOCK_TRANSFER,
            stockTransferItemId: transferItem.id,
            remarks: dto.remarks,
            createdByUserId: actorId,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: dto.toLocationId,
            movementType: MovementType.TRANSFER_IN,
            quantity,
            unitCost,
            movementDate: transferDate,
            sourceType: MovementSourceType.STOCK_TRANSFER,
            stockTransferItemId: transferItem.id,
            remarks: dto.remarks,
            createdByUserId: actorId,
          },
        });

        await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: item.productId, locationId: dto.fromLocationId } },
          create: { productId: item.productId, locationId: dto.fromLocationId, quantity: quantity.negated() },
          update: { quantity: { decrement: quantity } },
        });
        await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: item.productId, locationId: dto.toLocationId } },
          create: { productId: item.productId, locationId: dto.toLocationId, quantity },
          update: { quantity: { increment: quantity } },
        });

        await strategy.recordConsumption(tx, { productId: item.productId, locationId: dto.fromLocationId, quantity });
        await strategy.recordReceipt(tx, {
          productId: item.productId,
          locationId: dto.toLocationId,
          quantity,
          unitCost,
          stockTransferItemId: transferItem.id,
        });
      }

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'StockTransfer',
          entityId: transfer.id,
          afterData: { ...transfer, items: dto.items },
        },
        tx,
      );

      return tx.stockTransfer.findUniqueOrThrow({
        where: { id: transfer.id },
        include: { items: { include: { product: true } }, fromLocation: true, toLocation: true },
      });
    });
  }

  async adjustStock(dto: CreateStockAdjustmentDto, actorId: string) {
    const settings = await this.companySettings.get();
    const strategy = await this.costingRegistry.resolve();
    const adjustmentDate = dto.adjustmentDate ?? new Date();
    const postToTransactionLedger = dto.postToTransactionLedger ?? true;

    return this.prisma.$transaction(async (tx) => {
      await tx.location.findUniqueOrThrow({ where: { id: dto.locationId } });

      const adjustmentNumber = await this.numbering.nextNumber(tx, DocumentType.STOCK_ADJUSTMENT);
      const adjustment = await tx.stockAdjustment.create({
        data: {
          adjustmentNumber,
          locationId: dto.locationId,
          reason: dto.reason,
          adjustmentDate,
          remarks: dto.remarks,
          postToTransactionLedger,
          createdByUserId: actorId,
        },
      });

      let totalValueImpact = ZERO;

      for (const item of dto.items) {
        await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
        const quantityDelta = new Prisma.Decimal(item.quantityDelta);
        if (quantityDelta.isZero()) continue;

        const existingBalance = await tx.inventoryBalance.findUnique({
          where: { productId_locationId: { productId: item.productId, locationId: dto.locationId } },
        });
        const currentQty = existingBalance?.quantity ?? ZERO;
        if (
          settings.stockShortagePolicy === StockShortagePolicy.PREVENT_NEGATIVE &&
          currentQty.plus(quantityDelta).isNegative()
        ) {
          throw new BadRequestException(`Adjustment would take product ${item.productId} negative at this location`);
        }

        const adjustmentItem = await tx.stockAdjustmentItem.create({
          data: {
            stockAdjustmentId: adjustment.id,
            productId: item.productId,
            quantityDelta,
            unitCostOverride: item.unitCostOverride,
          },
        });

        const currentCost = await strategy.getCurrentUnitCost(tx, item.productId, dto.locationId);
        const unitCost = item.unitCostOverride != null ? new Prisma.Decimal(item.unitCostOverride) : currentCost;

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            locationId: dto.locationId,
            movementType: quantityDelta.isPositive() ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT,
            quantity: quantityDelta,
            unitCost,
            movementDate: adjustmentDate,
            sourceType: MovementSourceType.STOCK_ADJUSTMENT,
            stockAdjustmentItemId: adjustmentItem.id,
            remarks: dto.remarks,
            createdByUserId: actorId,
          },
        });

        await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: item.productId, locationId: dto.locationId } },
          create: { productId: item.productId, locationId: dto.locationId, quantity: quantityDelta },
          update: { quantity: { increment: quantityDelta } },
        });

        if (quantityDelta.isPositive()) {
          await strategy.recordReceipt(tx, { productId: item.productId, locationId: dto.locationId, quantity: quantityDelta, unitCost });
        } else {
          await strategy.recordConsumption(tx, {
            productId: item.productId,
            locationId: dto.locationId,
            quantity: quantityDelta.negated(),
          });
        }

        totalValueImpact = totalValueImpact.plus(quantityDelta.times(unitCost));
      }

      if (postToTransactionLedger && !totalValueImpact.isZero()) {
        await this.transactions.record(tx, {
          transactionType: TransactionType.STOCK_ADJUSTMENT_VALUE,
          amount: totalValueImpact,
          description: `Stock adjustment ${adjustment.adjustmentNumber} (${dto.reason})`,
          referenceType: 'StockAdjustment',
          referenceId: adjustment.id,
          createdByUserId: actorId,
        });
      }

      await this.audit.log(
        {
          userId: actorId,
          action: 'CREATE',
          entityType: 'StockAdjustment',
          entityId: adjustment.id,
          afterData: { ...adjustment, items: dto.items },
        },
        tx,
      );

      return tx.stockAdjustment.findUniqueOrThrow({
        where: { id: adjustment.id },
        include: { items: { include: { product: true } }, location: true },
      });
    });
  }
}
