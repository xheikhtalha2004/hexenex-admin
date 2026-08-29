import { Injectable, BadRequestException } from '@nestjs/common';
import { QuotationCalculationResult, QuotationCalculationStrategy } from './quotation-calculation-strategy.interface';

/** "Fix" = a manually typed custom width. The numeric entries are the factory's standard
 * counter widths in inches (matching the 24"/36"/52" counter categories). "Self" bypasses the
 * qty/width/length formula and lets staff type the sq ft directly. */
export const SIZE_OPTIONS = ['FIX', '6', '8', '12', '18', '24', '36', '48', '52', 'SELF'] as const;
export type SizeOption = (typeof SIZE_OPTIONS)[number];

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The client's actual quotation formula, confirmed via a reference document (a filled-in
 * example spreadsheet) after the questionnaire deferred it for a personal discussion — see
 * docs/client-clarifications.md item 1.
 *
 *   FIX or a standard width (6/8/12/18/24/36/52 inches): sqft = qty * width * length / 144
 *     - "FIX" uses a manually typed width; a numeric size option uses that inch value as the
 *       width instead of a typed one. Both still require qty and a manually typed length.
 *   SELF: sqft is typed directly — qty/width/length are not part of the calculation at all.
 *
 * Every mode ends the same way: amount = sqft * rate. The returned `quantity` IS the computed
 * sqft (the actual billed unit), matching how `computedQuantity` is already treated everywhere
 * else in the app (inventory, sales invoices) as "the sq ft quantity", not a piece count.
 */
@Injectable()
export class SqftDimensionsStrategy implements QuotationCalculationStrategy {
  key = 'SQFT_DIMENSIONS';

  calculate(_parameters: Record<string, unknown>, itemInput: Record<string, unknown>): QuotationCalculationResult {
    const rate = Number(itemInput.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new BadRequestException('Rate must be a non-negative number');

    const sizeOption = String(itemInput.sizeOption ?? 'FIX').toUpperCase();
    let sqft: number;

    if (sizeOption === 'SELF') {
      sqft = Number(itemInput.sqft);
      if (!Number.isFinite(sqft) || sqft <= 0) {
        throw new BadRequestException('Sq ft must be a positive number when "Self" is selected');
      }
    } else {
      const quantity = Number(itemInput.quantity);
      const length = Number(itemInput.length);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Quantity must be a positive number');
      if (!Number.isFinite(length) || length <= 0) throw new BadRequestException('Length must be a positive number');

      let width: number;
      if (sizeOption === 'FIX') {
        width = Number(itemInput.width);
        if (!Number.isFinite(width) || width <= 0) {
          throw new BadRequestException('Width must be a positive number when "Fix" is selected');
        }
      } else if ((SIZE_OPTIONS as readonly string[]).includes(sizeOption)) {
        width = Number(sizeOption);
      } else {
        throw new BadRequestException(`Unknown size option: ${sizeOption}`);
      }

      sqft = (quantity * width * length) / 144;
    }

    const roundedSqft = round2(sqft);
    return { quantity: roundedSqft, rate, amount: round2(roundedSqft * rate) };
  }
}
