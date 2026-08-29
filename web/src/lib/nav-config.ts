import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Undo2,
  Users,
  Truck,
  ShoppingCart,
  Boxes,
  ArrowRightLeft,
  Wallet,
  Landmark,
  BarChart3,
  ShieldCheck,
  Tags,
  History,
  Settings,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** If set, item is only shown when the user has this permission (or any one, if an array). Omit for always-visible items. */
  permission?: string | string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Sales',
    items: [
      { title: 'Quotations', href: '/quotations', icon: FileText, permission: 'quotation.view' },
      { title: 'Sales Invoices', href: '/sales-invoices', icon: Receipt, permission: 'sales_invoice.view' },
      { title: 'Sales Returns', href: '/sales-returns', icon: Undo2, permission: 'sales_return.view' },
    ],
  },
  {
    title: 'Accounts',
    items: [
      { title: 'Customers', href: '/customers', icon: Users, permission: 'customer.view' },
      { title: 'Suppliers', href: '/suppliers', icon: Truck, permission: 'supplier.view' },
      { title: 'Settlements', href: '/settlements', icon: ArrowRightLeft, permission: 'settlement.view' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { title: 'Products', href: '/products', icon: Tags, permission: 'product.manage' },
      { title: 'Purchases', href: '/purchases', icon: ShoppingCart, permission: 'purchase_invoice.view' },
      { title: 'Inventory', href: '/inventory', icon: Boxes, permission: 'inventory.view' },
      { title: 'Expenses', href: '/expenses', icon: Wallet, permission: 'expense.view' },
    ],
  },
  {
    title: 'Insights',
    items: [
      {
        title: 'Reports',
        href: '/reports',
        icon: BarChart3,
        // Manager only holds product_pnl.view (per the questionnaire: product-wise P&L, not
        // company-wide reports) — still needs the nav link to reach that one report.
        permission: ['reports.view', 'product_pnl.view'],
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      { title: 'Bank & Cash', href: '/accounts', icon: Landmark, permission: 'accounts.view' },
      { title: 'Users', href: '/admin/users', icon: ShieldCheck, permission: 'user.manage' },
      { title: 'Settings', href: '/admin/settings', icon: Settings, permission: 'company_settings.manage' },
      { title: 'Audit Log', href: '/admin/audit-log', icon: History, permission: 'audit_log.view' },
    ],
  },
];
