import { Injectable } from '@nestjs/common';
import { CostingMethod } from '@prisma/client';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { CostingStrategy } from './costing-strategy.interface';
import { WeightedAverageCostingStrategy } from './weighted-average-costing.strategy';
import { FifoCostingStrategy } from './fifo-costing.strategy';
import { BatchCostingStrategy } from './batch-costing.strategy';

/**
 * Resolves the active CostingStrategy from `CompanySettings.defaultCostingMethod`, so
 * switching methods is a settings change, not a redeploy. Only WEIGHTED_AVERAGE has a real
 * implementation in V1 (see docs/client-clarifications.md item 2).
 */
@Injectable()
export class CostingStrategyRegistry {
  private readonly strategies: Record<CostingMethod, CostingStrategy>;

  constructor(
    private readonly companySettings: CompanySettingsService,
    weightedAverage: WeightedAverageCostingStrategy,
    fifo: FifoCostingStrategy,
    batch: BatchCostingStrategy,
  ) {
    this.strategies = {
      [CostingMethod.WEIGHTED_AVERAGE]: weightedAverage,
      [CostingMethod.FIFO]: fifo,
      [CostingMethod.BATCH]: batch,
    };
  }

  async resolve(): Promise<CostingStrategy> {
    const settings = await this.companySettings.get();
    return this.strategies[settings.defaultCostingMethod];
  }
}
