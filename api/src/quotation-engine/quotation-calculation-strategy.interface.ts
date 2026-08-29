export interface QuotationCalculationResult {
  quantity: number;
  rate: number;
  amount: number;
}

/**
 * Pluggable per-line quotation math. The client's real formula is still TBD (needs a personal
 * discussion — see docs/client-clarifications.md item 1); this interface, plus
 * `QuotationCalculationProfile.strategyKey`/`parameters`, exists so the real formula can be
 * dropped in later as a new class + a new seeded profile — no controller/DTO/schema change.
 */
export interface QuotationCalculationStrategy {
  key: string;
  calculate(parameters: Record<string, unknown>, itemInput: Record<string, unknown>): QuotationCalculationResult;
}
