/**
 * GLB-01: production cleanup. Deletes every transactional/demo record — quotations, sales
 * invoices and returns, purchases, payments, advances, settlements, expenses, inventory
 * movements/balances/costs, account transactions, the central transaction log, and the audit
 * log — while leaving configuration, users, roles and permissions, product categories and
 * products, locations, expense categories, company settings, quotation calculation profiles,
 * and bank/cash accounts (as configuration) untouched. Document numbering sequences are reset
 * so the first real document after go-live starts at number 1.
 *
 * Deletion order matters — this follows the actual foreign key graph (children before
 * parents) rather than a guess, since several tables reference each other in non-obvious
 * directions (e.g. CustomerLedgerEntry holds the FK to SalesInvoice, not the other way round).
 *
 * Run with: npm run db:clear-transactional-data
 * Requires typing the exact confirmation phrase, since this is irreversible.
 */
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();
const CONFIRMATION_PHRASE = 'DELETE ALL TRANSACTIONAL DATA';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function main() {
  console.log(
    'This permanently deletes every quotation, sales invoice, sales return, purchase,',
  );
  console.log(
    'customer/supplier payment, advance, settlement, expense, inventory movement and',
  );
  console.log(
    'balance, account transaction, transaction log entry, and audit log entry.',
  );
  console.log(
    'Users, roles, permissions, products, categories, locations, company settings, and',
  );
  console.log(
    'bank/cash accounts themselves are NOT touched (their balances reset to zero along',
  );
  console.log('with the transaction history that produced them).');
  console.log('');
  const answer = await ask(`Type "${CONFIRMATION_PHRASE}" to proceed: `);
  if (answer.trim() !== CONFIRMATION_PHRASE) {
    console.log('Confirmation did not match. Nothing was deleted.');
    process.exit(1);
  }

  await prisma.$transaction(
    async (tx) => {
      // Leaves first: nothing else references these.
      await tx.auditLog.deleteMany();
      await tx.transaction.deleteMany();

      // Settlement holds the unique FKs to the two ledger entries below — must go first.
      await tx.customerSupplierSettlement.deleteMany();

      // Account transactions and ledger entries hold FKs into the documents/payments below —
      // must be cleared before those documents can be deleted.
      await tx.accountTransaction.deleteMany();
      await tx.customerLedgerEntry.deleteMany();
      await tx.supplierLedgerEntry.deleteMany();

      // Inventory movements and cost allocations reference the line items below.
      await tx.inventoryMovement.deleteMany();
      await tx.costAllocation.deleteMany();

      // Sales returns before the invoices/items they return against.
      await tx.salesReturnItem.deleteMany();
      await tx.salesReturn.deleteMany();

      await tx.salesInvoiceItem.deleteMany();
      await tx.salesInvoice.deleteMany();

      await tx.quotationItem.deleteMany();
      await tx.quotation.deleteMany();

      await tx.purchaseInvoiceItem.deleteMany();
      await tx.purchaseInvoice.deleteMany();

      await tx.productCost.deleteMany();
      await tx.inventoryItemUnit.deleteMany();
      await tx.inventoryBalance.deleteMany();

      await tx.stockTransferItem.deleteMany();
      await tx.stockTransfer.deleteMany();
      await tx.stockAdjustmentItem.deleteMany();
      await tx.stockAdjustment.deleteMany();

      await tx.customerPayment.deleteMany();
      await tx.supplierPayment.deleteMany();
      await tx.supplierAdvance.deleteMany();

      await tx.expense.deleteMany();

      // Reset balances to zero now that the ledgers producing them are gone.
      await tx.account.updateMany({ data: { currentBalance: 0 } });
      await tx.customer.updateMany({ data: { currentBalance: 0 } });
      await tx.supplier.updateMany({ data: { currentBalance: 0 } });

      await tx.customer.deleteMany();
      await tx.supplier.deleteMany();

      // Restart document numbering from 1 for the real, live dataset.
      await tx.documentNumberSequence.deleteMany();
    },
    { timeout: 30_000 },
  );

  console.log(
    'Transactional data cleared. Configuration, users, and master data are untouched.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
