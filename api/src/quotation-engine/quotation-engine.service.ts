import { Injectable, NotFoundException } from '@nestjs/common';
import { QuotationCalculationResult, QuotationCalculationStrategy } from './quotation-calculation-strategy.interface';
import { PlaceholderManualStrategy } from './placeholder-manual.strategy';
import { SqftDimensionsStrategy } from './sqft-dimensions.strategy';

@Injectable()
export class QuotationEngineService {
  private readonly strategies: Map<string, QuotationCalculationStrategy>;

  constructor(placeholderManual: PlaceholderManualStrategy, sqftDimensions: SqftDimensionsStrategy) {
    this.strategies = new Map([
      [placeholderManual.key, placeholderManual],
      [sqftDimensions.key, sqftDimensions],
    ]);
  }

  calculate(strategyKey: string, parameters: Record<string, unknown>, itemInput: Record<string, unknown>): QuotationCalculationResult {
    const strategy = this.strategies.get(strategyKey);
    if (!strategy) throw new NotFoundException(`Unknown quotation calculation strategy: ${strategyKey}`);
    return strategy.calculate(parameters, itemInput);
  }
}
