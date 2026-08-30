'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText, Receipt, ShoppingCart, ArrowRightLeft, Wallet, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const HIDE_FIGURES_KEY = 'dashboard-hide-figures';

interface CompanyPnl {
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  totalExpenses: string;
  netProfit: string;
}
interface ProductPnlRow {
  productId: string;
  productName: string;
  revenue: string;
  grossProfit: string;
  marginPct: number;
}
interface ProductPnlResponse {
  products: ProductPnlRow[];
}
interface OutstandingResponse {
  totalOutstanding: string;
}
interface PayableResponse {
  totalPayable: string;
}
interface InventoryValueResponse {
  totalValue: string;
}
interface LowStockRow {
  productId: string;
  productName: string;
  locationName: string;
  quantity: string;
  reorderLevel: string | null;
  isNegativeStock: boolean;
}
interface TransactionRow {
  id: string;
  transactionType: string;
  transactionDate: string;
  amount: string;
  description: string;
}
interface Paginated<T> {
  data: T[];
}
interface PendingAction {
  id: string;
  action: string;
  customerName: string;
  href: string;
}

function last30DaysQuery() {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  return `dateFrom=${dateFrom.toISOString()}&dateTo=${dateTo.toISOString()}`;
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const range = last30DaysQuery();

  // DSH-01: hide/view control for the financial KPI cards. Hidden by default every session —
  // only becomes visible once the user explicitly clicks "Show figures" this session
  // (sessionStorage) — it never changes what is calculated, only what is displayed.
  const [figuresHidden, setFiguresHidden] = useState(
    () => typeof window === 'undefined' || sessionStorage.getItem(HIDE_FIGURES_KEY) !== '0',
  );
  function toggleFiguresHidden() {
    setFiguresHidden((prev) => {
      const next = !prev;
      sessionStorage.setItem(HIDE_FIGURES_KEY, next ? '1' : '0');
      return next;
    });
  }

  // Low stock alerts, top products, recent transactions, and needs-your-action all start
  // collapsed to a single summary row — clicking the header expands them in place.
  const [needsActionOpen, setNeedsActionOpen] = useState(false);
  const [negativeStockOpen, setNegativeStockOpen] = useState(true);
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [topProductsOpen, setTopProductsOpen] = useState(false);
  const [recentTxnOpen, setRecentTxnOpen] = useState(false);

  const companyPnlQuery = useQuery({
    queryKey: ['dashboard-company-pnl'],
    queryFn: () => apiClient.get<CompanyPnl>(`/reports/company-pnl?${range}`),
    enabled: hasPermission('company_pnl.view'),
  });
  const outstandingQuery = useQuery({
    queryKey: ['dashboard-outstanding'],
    queryFn: () => apiClient.get<OutstandingResponse>('/reports/customer-outstanding'),
    enabled: hasPermission('reports.view'),
  });
  const payableQuery = useQuery({
    queryKey: ['dashboard-payable'],
    queryFn: () => apiClient.get<PayableResponse>('/reports/supplier-payable'),
    enabled: hasPermission('reports.view'),
  });
  const inventoryValueQuery = useQuery({
    queryKey: ['dashboard-inventory-value'],
    queryFn: () => apiClient.get<InventoryValueResponse>('/reports/inventory-value'),
    enabled: hasPermission('reports.view'),
  });
  const lowStockQuery = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: () => apiClient.get<LowStockRow[]>('/inventory/low-stock'),
    enabled: hasPermission('inventory.view'),
  });
  const negativeStockQuery = useQuery({
    queryKey: ['dashboard-negative-stock'],
    queryFn: () => apiClient.get<LowStockRow[]>('/inventory/negative-stock'),
    enabled: hasPermission('inventory.view'),
  });
  const productPnlQuery = useQuery({
    queryKey: ['dashboard-product-pnl'],
    queryFn: () => apiClient.get<ProductPnlResponse>(`/reports/product-pnl?${range}`),
    enabled: hasPermission('product_pnl.view'),
  });
  const transactionsQuery = useQuery({
    queryKey: ['dashboard-transactions'],
    queryFn: () => apiClient.get<Paginated<TransactionRow>>('/reports/transactions?pageSize=8'),
    enabled: hasPermission('reports.view'),
  });
  // Owner notifications for approved quotations that still need to become invoices.
  const pendingActionsQuery = useQuery({
    queryKey: ['dashboard-pending-actions'],
    queryFn: () => apiClient.get<{ actions: PendingAction[] }>('/reports/pending-actions'),
    enabled: hasPermission('quotation.approve'),
  });

  const topProducts = [...(productPnlQuery.data?.products ?? [])].sort((a, b) => Number(b.grossProfit) - Number(a.grossProfit)).slice(0, 5);

  const quickActions = [
    { label: 'New Quotation', href: '/quotations', permission: 'quotation.create', icon: FileText },
    { label: 'New Sales Invoice', href: '/sales-invoices', permission: 'sales_invoice.create', icon: Receipt },
    { label: 'New Purchase', href: '/purchases', permission: 'purchase_invoice.create', icon: ShoppingCart },
    { label: 'New Settlement', href: '/settlements', permission: 'settlement.create', icon: ArrowRightLeft },
    { label: 'Record Expense', href: '/expenses', permission: 'expense.create', icon: Wallet },
  ].filter((a) => hasPermission(a.permission));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.fullName}</h1>
        <p className="text-muted-foreground">
          Signed in as <span className="font-medium">{user?.roleName.replace('_', ' ')}</span>. Figures below cover the last 30 days.
        </p>
      </div>

      {hasPermission('company_pnl.view') && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={toggleFiguresHidden}>
              {figuresHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              {figuresHidden ? 'Show figures' : 'Hide figures'}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Revenue (30d)" value={companyPnlQuery.data?.totalRevenue} loading={companyPnlQuery.isLoading} hidden={figuresHidden} />
            <Kpi
              label="Net profit (30d)"
              value={companyPnlQuery.data?.netProfit}
              loading={companyPnlQuery.isLoading}
              signed
              hidden={figuresHidden}
            />
            <Kpi
              label="Customer outstanding"
              value={outstandingQuery.data?.totalOutstanding}
              loading={outstandingQuery.isLoading}
              hidden={figuresHidden}
            />
            <Kpi label="Supplier payable" value={payableQuery.data?.totalPayable} loading={payableQuery.isLoading} hidden={figuresHidden} />
            <Kpi label="Inventory value" value={inventoryValueQuery.data?.totalValue} loading={inventoryValueQuery.isLoading} hidden={figuresHidden} />
          </div>
        </div>
      )}

      {hasPermission('quotation.approve') && (pendingActionsQuery.data?.actions.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="cursor-pointer select-none" onClick={() => setNeedsActionOpen((o) => !o)}>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                Needs your action
                <Badge variant="secondary">{pendingActionsQuery.data?.actions.length ?? 0}</Badge>
              </span>
              {needsActionOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </CardTitle>
            <CardDescription>Approved quotations waiting to become finalized invoices.</CardDescription>
          </CardHeader>
          {needsActionOpen && (
            <CardContent>
              <ul className="divide-y text-sm">
                {pendingActionsQuery.data?.actions.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <span>
                      {a.action} <span className="text-muted-foreground">— {a.customerName}</span>
                    </span>
                    <Button render={<Link href={a.href} />} nativeButton={false} variant="outline" size="sm">
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      {hasPermission('inventory.view') && (
        <Card className={cn(negativeStockQuery.data?.length && 'border-destructive/50')}>
          <CardHeader className="cursor-pointer select-none" onClick={() => setNegativeStockOpen((o) => !o)}>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-destructive" />
                Negative stock - needs arrangement
                {negativeStockQuery.data?.length ? <Badge variant="destructive">{negativeStockQuery.data.length}</Badge> : null}
              </span>
              {negativeStockOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </CardTitle>
            <CardDescription>Items invoiced to customers before enough stock was available.</CardDescription>
          </CardHeader>
          {negativeStockOpen && (
            <CardContent>
              {negativeStockQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : negativeStockQuery.data?.length ? (
                <ul className="space-y-2 text-sm">
                  {negativeStockQuery.data.slice(0, 8).map((row) => (
                    <li key={`${row.productId}:${row.locationName}`} className="flex items-center justify-between">
                      <span>
                        {row.productName} <span className="text-muted-foreground">({row.locationName})</span>
                      </span>
                      <Badge variant="destructive">{Number(row.quantity).toLocaleString()} sq ft</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No stock needs to be arranged right now.</p>
              )}
              <Button render={<Link href="/inventory?negativeStockOnly=true" />} nativeButton={false} variant="outline" size="sm" className="mt-3">
                View negative stock
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {hasPermission('inventory.view') && (
          <Card>
            <CardHeader className="cursor-pointer select-none" onClick={() => setLowStockOpen((o) => !o)}>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Low stock alerts
                  {lowStockQuery.data?.length ? <Badge variant="destructive">{lowStockQuery.data.length}</Badge> : null}
                </span>
                {lowStockOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </CardTitle>
              <CardDescription>Products below their reorder level.</CardDescription>
            </CardHeader>
            {lowStockOpen && (
              <CardContent>
                {lowStockQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : lowStockQuery.data?.length ? (
                  <ul className="space-y-2 text-sm">
                    {lowStockQuery.data.slice(0, 6).map((row) => (
                      <li key={`${row.productId}`} className="flex items-center justify-between">
                        <span>
                          {row.productName} <span className="text-muted-foreground">({row.locationName})</span>
                        </span>
                        <Badge variant="destructive">{row.quantity}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing below reorder level right now.</p>
                )}
                <Button render={<Link href="/inventory?lowStockOnly=true" />} nativeButton={false} variant="outline" size="sm" className="mt-3">
                  View inventory
                </Button>
              </CardContent>
            )}
          </Card>
        )}

        {hasPermission('product_pnl.view') && (
          <Card>
            <CardHeader className="cursor-pointer select-none" onClick={() => setTopProductsOpen((o) => !o)}>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>Top products (30d)</span>
                {topProductsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </CardTitle>
              <CardDescription>By gross profit.</CardDescription>
            </CardHeader>
            {topProductsOpen && (
              <CardContent>
                {productPnlQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : topProducts.length ? (
                  <ul className="space-y-2 text-sm">
                    {topProducts.map((p) => (
                      <li key={p.productId} className="flex items-center justify-between">
                        <span>{p.productName}</span>
                        <span className="font-mono">
                          {Number(p.grossProfit).toLocaleString()} <span className="text-muted-foreground">({p.marginPct.toFixed(0)}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No sales in the last 30 days.</p>
                )}
                <Button render={<Link href="/reports" />} nativeButton={false} variant="outline" size="sm" className="mt-3">
                  Full report
                </Button>
              </CardContent>
            )}
          </Card>
        )}
      </div>

      {hasPermission('reports.view') && (
        <Card>
          <CardHeader className="cursor-pointer select-none" onClick={() => setRecentTxnOpen((o) => !o)}>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span>Recent transactions</span>
              {recentTxnOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </CardTitle>
          </CardHeader>
          {recentTxnOpen && (
            <CardContent>
              {transactionsQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : transactionsQuery.data?.data.length ? (
                <ul className="divide-y text-sm">
                  {transactionsQuery.data.data.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{t.transactionType.replace(/_/g, ' ')}</Badge>
                        <span>{t.description}</span>
                      </div>
                      <span className="font-mono">
                        {Number(t.amount) >= 0 ? '+' : ''}
                        {Number(t.amount).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              )}
              <Button render={<Link href="/reports" />} nativeButton={false} variant="outline" size="sm" className="mt-3">
                View all
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {quickActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {quickActions.map((action) => (
              <Button key={action.href} render={<Link href={action.href} />} nativeButton={false} variant="outline">
                <action.icon className="size-4" />
                {action.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  signed,
  hidden,
}: {
  label: string;
  value?: string;
  loading: boolean;
  signed?: boolean;
  hidden?: boolean;
}) {
  const numeric = Number(value ?? 0);
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-28 mt-0.5" />
        ) : hidden ? (
          <p className="text-[1.65rem] leading-none font-semibold tracking-tight text-muted-foreground">••••••</p>
        ) : (
          <p
            className={cn(
              'text-[1.65rem] leading-none font-semibold tracking-tight font-mono tabular-nums',
              signed && (numeric < 0 ? 'text-destructive' : 'text-success'),
            )}
          >
            {numeric.toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
