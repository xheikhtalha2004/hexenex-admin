import { Injectable, NotImplementedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CostingStrategy } from './costing-strategy.interface';

/** Not implemented pending client confirmation — see docs/client-clarifications.md item 2. */
@Injectable()
export class BatchCostingStrategy implements CostingStrategy {
  recordReceipt(): Promise<void> {
    throw new NotImplementedException('Batch costing is not implemented in V1 — pending client confirmation');
  }

  recordConsumption(): Promise<{ unitCost: Prisma.Decimal }> {
    throw new NotImplementedException('Batch costing is not implemented in V1 — pending client confirmation');
  }

  getCurrentUnitCost(): Promise<Prisma.Decimal> {
    throw new NotImplementedException('Batch costing is not implemented in V1 — pending client confirmation');
  }
}
