import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { CostingStrategyRegistry } from './costing-strategy.registry';
import { WeightedAverageCostingStrategy } from './weighted-average-costing.strategy';
import { FifoCostingStrategy } from './fifo-costing.strategy';
import { BatchCostingStrategy } from './batch-costing.strategy';

@Module({
  imports: [CompanySettingsModule],
  providers: [CostingStrategyRegistry, WeightedAverageCostingStrategy, FifoCostingStrategy, BatchCostingStrategy],
  exports: [CostingStrategyRegistry],
})
export class CostingModule {}
