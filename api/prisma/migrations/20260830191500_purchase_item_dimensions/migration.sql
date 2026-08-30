-- Preserve the original purchase dimensions while `quantity` remains the calculated stock
-- quantity in square feet.
ALTER TABLE "PurchaseInvoiceItem" ADD COLUMN "inputParameters" JSONB;
