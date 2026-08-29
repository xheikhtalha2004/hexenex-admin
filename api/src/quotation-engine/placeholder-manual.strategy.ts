import { Injectable, BadRequestException } from '@nestjs/common';
import { QuotationCalculationResult, QuotationCalculationStrategy } from './quotation-calculation-strategy.interface';

/**
 * No markup/wastage/discount math — staff type quantity and rate directly per line. This is
 * the seeded default (`QuotationCalculationProfile` id "placeholder-manual") until the client's
 * actual formula is confirmed. Keeps quotations usable from day one without inventing pricing
 * logic the client hasn't specified.
 */
@Injectable()
export class PlaceholderManualStrategy implements QuotationCalculationStrategy {
  key = 'PLACEHOLDER_MANUAL';

  calculate(_parameters: Record<string, unknown>, itemInput: Record<string, unknown>): QuotationCalculationResult {
    const quantity = Number(itemInput.quantity);
    const rate = Number(itemInput.rate);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Item quantity must be a positive number');
    if (!Number.isFinite(rate) || rate < 0) throw new BadRequestException('Item rate must be a non-negative number');
    return { quantity, rate, amount: quantity * rate };
  }
}
