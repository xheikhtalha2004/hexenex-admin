'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, downloadFile } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductPnlRow {
  productId: string;
  productName: string;
  categoryName: string;
  quantitySold: string;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPct: number;
}
interface ProductPnlResponse {
  products: ProductPnlRow[];
  categoryTotals: { categoryId: string; categoryName: string; revenue: string; cost: string; grossProfit: string }[];
  totals: { revenue: string; cost: string; grossProfit: string; marginPct: number };
}
interface CompanyPnl {
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  totalExpenses: string;
  netProfit: string;
}
interface TransactionRow {
  id: string;
  transactionType: string;
  transactionDate: string;
  amount: string;
  description: string;
  partyName: string | null;
}
interface PartyOption {
  id: string;
  name: string;
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
interface OutstandingParty {
  id: string;
  name: string;
  phone: string | null;
  currentBalance: string;
  isActive: boolean;
}

const TRANSACTION_TYPES = [
  'SALES_INVOICE',
  'SALES_RETURN',
  'PURCHASE_INVOICE',
  'CUSTOMER_PAYMENT',
  'SUPPLIER_PAYMENT',
  'SUPPLIER_ADVANCE',
  'CROSS_SETTLEMENT',
  'EXPENSE',
  'STOCK_ADJUSTMENT_VALUE',
  'OPENING_BALANCE',
];

export default function ReportsPage() {
  return (
    <PermissionGate permission={['reports.view', 'product_pnl.view']}>
      <ReportsContent />
    </PermissionGate>
  );
}

function ReportsContent() {
  const { hasPermission } = useAuth();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Product and company profitability, the full transaction history, and outstanding balances.</p>
      </div>

      {hasPermission('product_pnl.view') && <ProductPnlSection />}
      {hasPermission('company_pnl.view') && <CompanyPnlSection />}
      {hasPermission('reports.view') && <TransactionsSection />}
      {hasPermission('reports.view') && <OutstandingSection />}
    </div>
  );
}

function useDateRange() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const queryString = `${dateFrom ? `dateFrom=${dateFrom}&` : ''}${dateTo ? `dateTo=${dateTo}&` : ''}`;
  return { dateFrom, setDateFrom, dateTo, setDateTo, queryString };
}

function ProductPnlSection() {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('reports.export');
  const { dateFrom, setDateFrom, dateTo, setDateTo, queryString } = useDateRange();
  const [productSearch, setProductSearch] = useState('');
  const pnlQuery = useQuery({
    queryKey: ['product-pnl', queryString],
    queryFn: () => apiClient.get<ProductPnlResponse>(`/reports/product-pnl?${queryString}`),
  });

  // RPT-03: filters the already-fetched rows only — the totals row still reflects the full
  // date range, not the filtered subset, so a search never makes the totals look wrong.
  const visibleProducts = (pnlQuery.data?.products ?? []).filter((p) =>
    p.productName.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Product-wise Profit &amp; Loss</CardTitle>
          <CardDescription>Revenue and cost are net of returns, attributed to the return&apos;s own date.</CardDescription>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadFile(`/reports/product-pnl/pdf?${queryString}`, 'product-pnl.pdf').catch(() => toast.error('Could not export'))}
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadFile(`/reports/product-pnl/excel?${queryString}`, 'product-pnl.xlsx').catch(() => toast.error('Could not export'))
              }
            >
              Export Excel
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="pnlFrom">From</Label>
            <Input id="pnlFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pnlTo">To</Label>
            <Input id="pnlTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pnlSearch">Search product</Label>
            <Input
              id="pnlSearch"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Product name"
              className="w-56"
            />
          </div>
        </div>

        {pnlQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Square Feet Sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Gross profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProducts.length ? (
                <>
                  {visibleProducts.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell>{row.categoryName}</TableCell>
                      <TableCell className="text-right font-mono">{Number(row.quantitySold).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{Number(row.revenue).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{Number(row.cost).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{Number(row.grossProfit).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{row.marginPct.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell colSpan={3}>Total{productSearch ? ' (full range, not filtered)' : ''}</TableCell>
                    <TableCell className="text-right font-mono">{Number(pnlQuery.data?.totals.revenue).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{Number(pnlQuery.data?.totals.cost).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{Number(pnlQuery.data?.totals.grossProfit).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{pnlQuery.data?.totals.marginPct.toFixed(1)}%</TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {productSearch ? 'No products match this search.' : 'No sales in this range.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CompanyPnlSection() {
  const { dateFrom, setDateFrom, dateTo, setDateTo, queryString } = useDateRange();
  const companyQuery = useQuery({
    queryKey: ['company-pnl', queryString],
    queryFn: () => apiClient.get<CompanyPnl>(`/reports/company-pnl?${queryString}`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company Profit &amp; Loss</CardTitle>
        <CardDescription>Admin-only — includes expenses on top of product gross profit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="companyFrom">From</Label>
            <Input id="companyFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyTo">To</Label>
            <Input id="companyTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
          </div>
        </div>

        {companyQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : companyQuery.data ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {(
              [
                ['Revenue', companyQuery.data.totalRevenue, false],
                ['Cost', companyQuery.data.totalCost, false],
                ['Gross profit', companyQuery.data.grossProfit, true],
                ['Expenses', companyQuery.data.totalExpenses, false],
                ['Net profit', companyQuery.data.netProfit, true],
              ] as const
            ).map(([label, value, signed]) => (
              <div key={label} className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
                <p
                  className={cn(
                    'text-xl font-semibold tracking-tight font-mono tabular-nums',
                    signed && (Number(value) < 0 ? 'text-destructive' : 'text-success'),
                  )}
                >
                  {Number(value).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TransactionsSection() {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('reports.export');
  const [page, setPage] = useState(1);
  const [transactionType, setTransactionType] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Encoded as "customer:<id>" or "supplier:<id>" so one control covers both (RPT-01's
  // "Customer/Party filter"), since the backend takes them as two separate query params.
  const [party, setParty] = useState('ALL');

  const customersQuery = useQuery({ queryKey: ['customers-picker'], queryFn: () => apiClient.get<PartyOption[]>('/customers/picker') });
  const suppliersQuery = useQuery({ queryKey: ['suppliers-picker'], queryFn: () => apiClient.get<PartyOption[]>('/suppliers/picker') });

  const [partyKind, partyId] = party === 'ALL' ? [null, null] : party.split(':');

  const filterQueryString = `${transactionType !== 'ALL' ? `&transactionType=${transactionType}` : ''}${
    search ? `&search=${encodeURIComponent(search)}` : ''
  }${partyKind === 'customer' ? `&customerId=${partyId}` : ''}${partyKind === 'supplier' ? `&supplierId=${partyId}` : ''}${
    dateFrom ? `&dateFrom=${dateFrom}` : ''
  }${dateTo ? `&dateTo=${dateTo}` : ''}`;

  const txnQuery = useQuery({
    queryKey: ['reports-transactions', page, transactionType, search, party, dateFrom, dateTo],
    queryFn: () => apiClient.get<Paginated<TransactionRow>>(`/reports/transactions?page=${page}&pageSize=20${filterQueryString}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Central Transaction History</CardTitle>
          <CardDescription>Every financial event across the system, in one chronological log.</CardDescription>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadFile(`/reports/transactions/pdf?${filterQueryString.replace(/^&/, '')}`, 'transactions.pdf').catch(() =>
                  toast.error('Could not export'),
                )
              }
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadFile(`/reports/transactions/excel?${filterQueryString.replace(/^&/, '')}`, 'transactions.xlsx').catch(() =>
                  toast.error('Could not export'),
                )
              }
            >
              Export Excel
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={transactionType}
              onValueChange={(v) => {
                setTransactionType(v ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Customer/Party</Label>
            <Select
              items={{
                ALL: 'All customers/parties',
                ...Object.fromEntries((customersQuery.data ?? []).map((c) => [`customer:${c.id}`, `${c.name} (customer)`])),
                ...Object.fromEntries((suppliersQuery.data ?? []).map((s) => [`supplier:${s.id}`, `${s.name} (supplier)`])),
              }}
              value={party}
              onValueChange={(v) => {
                setParty(v ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All customers/parties</SelectItem>
                {customersQuery.data?.map((c) => (
                  <SelectItem key={`customer:${c.id}`} value={`customer:${c.id}`}>
                    {c.name} (customer)
                  </SelectItem>
                ))}
                {suppliersQuery.data?.map((s) => (
                  <SelectItem key={`supplier:${s.id}`} value={`supplier:${s.id}`}>
                    {s.name} (supplier)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
          <div className="space-y-2">
            <Label>Search description</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-64"
            />
          </div>
        </div>

        {txnQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer/Party</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txnQuery.data?.data.length ? (
                  txnQuery.data.data.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.transactionDate).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.transactionType.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t.partyName ?? '—'}</TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(t.amount) >= 0 ? '+' : ''}
                        {Number(t.amount).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No transactions match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {txnQuery.data && txnQuery.data.totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {txnQuery.data.page} of {txnQuery.data.totalPages} ({txnQuery.data.total} transactions)
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= txnQuery.data.totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OutstandingSection() {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('reports.export');
  const outstandingQuery = useQuery({
    queryKey: ['reports-customer-outstanding'],
    queryFn: () => apiClient.get<{ customers: OutstandingParty[]; totalOutstanding: string }>('/reports/customer-outstanding'),
  });
  const payableQuery = useQuery({
    queryKey: ['reports-supplier-payable'],
    queryFn: () => apiClient.get<{ suppliers: OutstandingParty[]; totalPayable: string }>('/reports/supplier-payable'),
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Customer Outstanding</CardTitle>
            <CardDescription>
              Total: <span className="font-mono">{Number(outstandingQuery.data?.totalOutstanding ?? 0).toLocaleString()}</span>
            </CardDescription>
          </div>
          {canExport && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadFile('/reports/customer-outstanding/pdf', 'customer-outstanding.pdf').catch(() => toast.error('Could not export'))}
              >
                Export PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadFile('/reports/customer-outstanding/excel', 'customer-outstanding.xlsx').catch(() => toast.error('Could not export'))
                }
              >
                Export Excel
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {outstandingQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingQuery.data?.customers.length ? (
                  outstandingQuery.data.customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-right font-mono">{Number(c.currentBalance).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                      No outstanding balances.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Supplier Payable</CardTitle>
            <CardDescription>
              Total: <span className="font-mono">{Number(payableQuery.data?.totalPayable ?? 0).toLocaleString()}</span>
            </CardDescription>
          </div>
          {canExport && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadFile('/reports/supplier-payable/pdf', 'supplier-payable.pdf').catch(() => toast.error('Could not export'))}
              >
                Export PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadFile('/reports/supplier-payable/excel', 'supplier-payable.xlsx').catch(() => toast.error('Could not export'))}
              >
                Export Excel
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {payableQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payableQuery.data?.suppliers.length ? (
                  payableQuery.data.suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-right font-mono">{Number(s.currentBalance).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                      No outstanding payables.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
