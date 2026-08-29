/**
 * The full permission catalogue. This is the single source of truth seeded into the
 * `Permission` table — the RBAC guard checks against these keys, never against role
 * names directly. Adding a new permission means adding a row here (and re-seeding);
 * it never requires touching guard/controller code.
 */
export interface PermissionDefinition {
  key: string;
  groupName: string;
  description: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  // Quotations
  { key: 'quotation.view', groupName: 'Quotations', description: 'View quotations' },
  { key: 'quotation.create', groupName: 'Quotations', description: 'Create quotations' },
  { key: 'quotation.edit', groupName: 'Quotations', description: 'Edit draft quotations' },
  { key: 'quotation.approve', groupName: 'Quotations', description: 'Approve or reject quotations' },
  { key: 'quotation.convert', groupName: 'Quotations', description: 'Convert an approved quotation to a sales invoice' },
  { key: 'quotation.delete', groupName: 'Quotations', description: 'Delete draft quotations' },

  // Sales invoices
  { key: 'sales_invoice.view', groupName: 'Sales Invoices', description: 'View sales invoices' },
  { key: 'sales_invoice.create', groupName: 'Sales Invoices', description: 'Create sales invoices' },
  { key: 'sales_invoice.edit', groupName: 'Sales Invoices', description: 'Edit draft sales invoices' },
  { key: 'sales_invoice.finalize', groupName: 'Sales Invoices', description: 'Finalize a sales invoice (deducts stock)' },
  { key: 'sales_invoice.cancel', groupName: 'Sales Invoices', description: 'Cancel a finalized sales invoice' },

  // Sales returns
  { key: 'sales_return.view', groupName: 'Sales Returns', description: 'View sales returns' },
  { key: 'sales_return.create', groupName: 'Sales Returns', description: 'Create sales returns' },

  // Customers / receivables
  { key: 'customer.view', groupName: 'Customers', description: 'View customer profiles' },
  { key: 'customer.manage', groupName: 'Customers', description: 'Create/edit customer profiles' },
  { key: 'customer_ledger.view', groupName: 'Customers', description: 'View customer ledger/statement' },
  { key: 'customer_payment.create', groupName: 'Customers', description: 'Record a customer payment receipt' },

  // Suppliers / payables
  { key: 'supplier.view', groupName: 'Suppliers', description: 'View supplier profiles' },
  { key: 'supplier.manage', groupName: 'Suppliers', description: 'Create/edit supplier profiles' },
  { key: 'supplier_ledger.view', groupName: 'Suppliers', description: 'View supplier ledger/statement' },
  { key: 'supplier_payment.create', groupName: 'Suppliers', description: 'Record a supplier payment' },
  { key: 'supplier_advance.create', groupName: 'Suppliers', description: 'Record a supplier advance' },

  // Cross settlement
  { key: 'settlement.view', groupName: 'Settlements', description: 'View customer-to-supplier settlements' },
  { key: 'settlement.create', groupName: 'Settlements', description: 'Create a customer-to-supplier settlement' },

  // Purchases
  { key: 'purchase_invoice.view', groupName: 'Purchases', description: 'View purchase invoices' },
  { key: 'purchase_invoice.create', groupName: 'Purchases', description: 'Create purchase invoices' },
  { key: 'purchase_invoice.finalize', groupName: 'Purchases', description: 'Finalize a purchase invoice (adds stock)' },

  // Inventory
  { key: 'inventory.view', groupName: 'Inventory', description: 'View stock balances and movements' },
  { key: 'product.manage', groupName: 'Inventory', description: 'Create/edit products and categories' },
  { key: 'location.manage', groupName: 'Inventory', description: 'Create/edit locations' },
  { key: 'stock_transfer.create', groupName: 'Inventory', description: 'Transfer stock between locations' },
  { key: 'stock_adjustment.create', groupName: 'Inventory', description: 'Adjust stock (damage/recount/correction)' },

  // Expenses
  { key: 'expense.view', groupName: 'Expenses', description: 'View expenses' },
  { key: 'expense.create', groupName: 'Expenses', description: 'Record an expense' },

  // P&L / Reports
  { key: 'product_pnl.view', groupName: 'Reports', description: 'View product-wise profit & loss' },
  { key: 'company_pnl.view', groupName: 'Reports', description: 'View overall company profit & loss / total sales' },
  { key: 'reports.view', groupName: 'Reports', description: 'View reports' },
  { key: 'reports.export', groupName: 'Reports', description: 'Export reports as PDF/Excel' },

  // Cash / receipts
  { key: 'receipt_voucher.print', groupName: 'Cash', description: 'Print payment receipt vouchers' },

  // Bank & cash accounts
  { key: 'accounts.view', groupName: 'Accounts', description: 'View cash and bank account balances' },
  { key: 'accounts.manage', groupName: 'Accounts', description: 'Add bank accounts and record manual cash entries' },

  // Administration
  { key: 'user.manage', groupName: 'Administration', description: 'Manage users' },
  { key: 'role.manage', groupName: 'Administration', description: 'Manage roles' },
  { key: 'permissions.manage', groupName: 'Administration', description: 'Grant/revoke permissions' },
  { key: 'company_settings.manage', groupName: 'Administration', description: 'Manage company settings' },
  { key: 'audit_log.view', groupName: 'Administration', description: 'View the audit log' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
