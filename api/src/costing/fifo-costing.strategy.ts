import { Injectable, NotImplementedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CostingStrategy } from './costing-strategy.interface';

/**
 * Not implemented pending client confirmation of the costing method — see
 * docs/client-clarifications.md item 2. `CostAllocation.quantityRemaining` already models
 * FIFO layers, so implementing this later is a service-only change, no schema migration.
 */
@Injectable()
export class FifoCostingStrategy implements CostingStrategy {
  recordReceipt(): Promise<void> {
    throw new NotImplementedException('FIFO costing is not implemented in V1 — pending client confirmation');
  }

  recordConsumption(): Promise<{ unitCost: Prisma.Decimal }> {
    throw new NotImplementedException('FIFO costing is not implemented in V1 — pending client confirmation');
  }

  getCurrentUnitCost(): Promise<Prisma.Decimal> {
    throw new NotImplementedException('FIFO costing is not implemented in V1 — pending client confirmation');
  }
}
