import { Prisma } from '@prisma/client';

export type TxClient = Prisma.TransactionClient;

export interface RecordReceiptParams {
  productId: string;
  locationId: string;
  quantity: Prisma.Decimal | number | string;
  unitCost: Prisma.Decimal | number | string;
  purchaseInvoiceItemId?: string;
  stockTransferItemId?: string;
}

export interface RecordConsumptionParams {
  productId: string;
  locationId: string;
  quantity: Prisma.Decimal | number | string;
}

/**
 * Pluggable per-product costing. V1 ships WEIGHTED_AVERAGE only (the client's confirmed
 * default); FIFO/BATCH are wired but throw NotImplementedException until a client decision
 * is made — see docs/client-clarifications.md item 2.
 */
export interface CostingStrategy {
  recordReceipt(tx: TxClient, params: RecordReceiptParams): Promise<void>;
  /** Returns the unit cost the consumption should be valued at (before quantity is deducted). */
  recordConsumption(tx: TxClient, params: RecordConsumptionParams): Promise<{ unitCost: Prisma.Decimal }>;
  getCurrentUnitCost(tx: TxClient, productId: string, locationId: string): Promise<Prisma.Decimal>;
}
