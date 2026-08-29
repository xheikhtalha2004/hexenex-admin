import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CostingStrategy,
  RecordConsumptionParams,
  RecordReceiptParams,
  TxClient,
} from './costing-strategy.interface';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class WeightedAverageCostingStrategy implements CostingStrategy {
  async recordReceipt(tx: TxClient, params: RecordReceiptParams): Promise<void> {
    const quantity = new Prisma.Decimal(params.quantity);
    const unitCost = new Prisma.Decimal(params.unitCost);

    const existing = await tx.productCost.findUnique({
      where: { productId_locationId: { productId: params.productId, locationId: params.locationId } },
    });

    const existingQty = existing?.quantityOnHandMirror ?? ZERO;
    const existingCost = existing?.weightedAverageCost ?? ZERO;
    const newQty = existingQty.plus(quantity);
    const newCost = newQty.isZero()
      ? unitCost
      : existingQty.times(existingCost).plus(quantity.times(unitCost)).dividedBy(newQty);

    await tx.productCost.upsert({
      where: { productId_locationId: { productId: params.productId, locationId: params.locationId } },
      create: {
        productId: params.productId,
        locationId: params.locationId,
        weightedAverageCost: newCost,
        quantityOnHandMirror: newQty,
      },
      update: {
        weightedAverageCost: newCost,
        quantityOnHandMirror: newQty,
      },
    });

    await tx.costAllocation.create({
      data: {
        productId: params.productId,
        locationId: params.locationId,
        purchaseInvoiceItemId: params.purchaseInvoiceItemId,
        stockTransferItemId: params.stockTransferItemId,
        quantityReceived: quantity,
        quantityRemaining: quantity,
        unitCost,
      },
    });
  }

  async recordConsumption(tx: TxClient, params: RecordConsumptionParams): Promise<{ unitCost: Prisma.Decimal }> {
    const quantity = new Prisma.Decimal(params.quantity);
    const existing = await tx.productCost.findUnique({
      where: { productId_locationId: { productId: params.productId, locationId: params.locationId } },
    });
    const unitCost = existing?.weightedAverageCost ?? ZERO;
    const newQty = (existing?.quantityOnHandMirror ?? ZERO).minus(quantity);

    await tx.productCost.upsert({
      where: { productId_locationId: { productId: params.productId, locationId: params.locationId } },
      create: {
        productId: params.productId,
        locationId: params.locationId,
        weightedAverageCost: unitCost,
        quantityOnHandMirror: newQty,
      },
      update: { quantityOnHandMirror: newQty },
    });

    return { unitCost };
  }

  async getCurrentUnitCost(tx: TxClient, productId: string, locationId: string): Promise<Prisma.Decimal> {
    const existing = await tx.productCost.findUnique({ where: { productId_locationId: { productId, locationId } } });
    return existing?.weightedAverageCost ?? ZERO;
  }
}
