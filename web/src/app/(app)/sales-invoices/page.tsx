'use client';

import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { apiClient, ApiError, openPdfInNewTab } from '@/lib/api-client';
import { PermissionGate } from '@/components/permission-gate';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Customer {
  id: string;
  name: string;
  currentBalance: string;
}
interface Location {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
}
interface ItemInputParameters {
  description?: string;
  sizeOption?: string;
  quantity?: number;
  width?: number;
  length?: number;
}
interface SalesInvoiceItem {
  id: string;
  quantity: string;
  rate: string;
  amount: string;
  product: { name: string };
  inputParameters?: ItemInputParameters;
}
interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  invoiceDate: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  advanceReceived: string;
  termsText: string | null;
  cancelReason: string | null;
  customer: Customer;
  location: Location;
  items: SalesInvoiceItem[];
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

const SIZE_OPTIONS = [
  { value: 'FIX', label: 'Fix (custom width)' },
  { value: '6', label: '6 (standard)' },
  { value: '8', label: '8 (standard)' },
  { value: '12', label: '12 (standard)' },
  { value: '18', label: '18 (standard)' },
  { value: '24', label: '24 (standard)' },
  { value: '36', label: '36 (standard)' },
  { value: '48', label: '48 (standard)' },
  { value: '52', label: '52 (standard)' },
  { value: 'SELF', label: 'Self (enter sq ft directly)' },
];

interface DraftItemRow {
  key: number;
  productId: string;
  sizeOption: string;
  quantity: string;
  width: string;
  length: string;
  sqft: string;
  rate: string;
}

let rowKeySeq = 0;
function newRow(productId = ''): DraftItemRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, productId, sizeOption: 'FIX', quantity: '', width: '', length: '', sqft: '', rate: '' };
}

function previewSqft(row: DraftItemRow): number | null {
  const sizeOption = row.sizeOption || 'FIX';
  if (sizeOption === 'SELF') {
    const sqft = Number(row.sqft);
    return Number.isFinite(sqft) && sqft > 0 ? sqft : null;
  }
  const quantity = Number(row.quantity);
  const length = Number(row.length);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(length) || length <= 0) return null;
  const width = sizeOption === 'FIX' ? Number(row.width) : Number(sizeOption);
  if (!Number.isFinite(width) || width <= 0) return null;
  return Math.round(((quantity * width * length) / 144) * 100) / 100;
}

function isRowComplete(row: DraftItemRow): boolean {
  if (!row.productId || !row.rate) return false;
  return previewSqft(row) !== null;
}

function previewAmount(row: DraftItemRow): number | null {
  const sqft = previewSqft(row);
  const rate = Number(row.rate);
  if (sqft === null || !Number.isFinite(rate) || rate <= 0) return null;
  return sqft * rate;
}

function formatAmount(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dimensionSummary(p: ItemInputParameters): string {
  if (!p.sizeOption) return '—';
  if (p.sizeOption === 'SELF') return 'Sq ft entered directly';
  const width = p.width != null ? p.width : (p.sizeOption !== 'FIX' ? p.sizeOption : '?');
  return `${p.quantity ?? '?'} pc(s) × ${width} × ${p.length ?? '?'}`;
}

export default function SalesInvoicesPage() {
  return (
    <PermissionGate permission="sales_invoice.view">
      <SalesInvoicesContent />
    </PermissionGate>
  );
}

function SalesInvoicesContent() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('sales_invoice.create');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [advanceReceived, setAdvanceReceived] = useState('0');
  const [termsText, setTermsText] = useState('');
  const [items, setItems] = useState<DraftItemRow[]>([newRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customersQuery = useQuery({ queryKey: ['customers-picker'], queryFn: () => apiClient.get<Customer[]>('/customers/picker') });
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: () => apiClient.get<Location[]>('/locations') });
  const productsQuery = useQuery({ queryKey: ['products-picker'], queryFn: () => apiClient.get<Product[]>('/product-picker') });

  // SIN-01: Factory is the default location on the create form until the user picks a
  // different one — derived at render time rather than synced via an effect, so there is
  // never a moment where the field is blank before an effect catches up.
  const defaultFactoryLocation = locationsQuery.data?.find((l) => l.name.toLowerCase().includes('factory'));
  const effectiveLocationId = locationId || defaultFactoryLocation?.id || '';

  const invoicesQuery = useQuery({
    queryKey: ['sales-invoices', page, search],
    queryFn: () =>
      apiClient.get<Paginated<SalesInvoice>>(
        `/sales-invoices?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  function updateItem(key: number, patch: Partial<DraftItemRow>) {
    setItems((rows) => {
      const next = rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
      const editedIndex = next.findIndex((row) => row.key === key);
      const editedRow = next[editedIndex];
      const editedLastRow = editedIndex === next.length - 1;
      if (
        editedLastRow &&
        editedRow.productId &&
        (patch.productId !== undefined || isRowComplete(editedRow))
      ) {
        return [...next, newRow(editedRow.productId)];
      }
      return next;
    });
  }
  function removeItem(key: number) {
    setItems((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }
  function resetForm() {
    setCustomerId('');
    setLocationId('');
    setAdvanceReceived('0');
    setTermsText('');
    setItems([newRow()]);
  }
  function openNewInvoice() {
    resetForm();
    setFormOpen(true);
  }

  const invoiceSquareFeet = items.reduce((sum, row) => sum + (previewSqft(row) ?? 0), 0);
  const invoiceSubtotal = items.reduce((sum, row) => sum + (previewAmount(row) ?? 0), 0);
  const selectedCustomer = customersQuery.data?.find((customer) => customer.id === customerId);
  const invoicePreviousBalance = Math.max(0, Number(selectedCustomer?.currentBalance ?? 0));
  const invoiceTotal = invoicePreviousBalance + invoiceSubtotal;
  const invoiceAdvance = Math.max(0, Number(advanceReceived) || 0);
  const invoiceRemaining = Math.max(0, invoiceTotal - invoiceAdvance);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !effectiveLocationId) {
      toast.error('Select a customer and a location');
      return;
    }
    const validItems = items.filter(isRowComplete);
    if (validItems.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    if (invoiceAdvance > invoiceTotal) {
      toast.error("Received cannot exceed the customer's total amount");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/sales-invoices', {
        customerId,
        locationId: effectiveLocationId,
        discountAmount: 0,
        advanceReceived: invoiceAdvance,
        termsText: termsText || undefined,
        items: validItems.map((r) => ({
          productId: r.productId,
          inputParameters: {
            sizeOption: r.sizeOption || 'FIX',
            quantity: r.quantity ? Number(r.quantity) : undefined,
            width: r.width ? Number(r.width) : undefined,
            length: r.length ? Number(r.length) : undefined,
            sqft: r.sqft ? Number(r.sqft) : undefined,
            rate: Number(r.rate),
          },
          quantity: previewSqft(r) ?? 0,
          rate: Number(r.rate),
        })),
      });
      toast.success('Sales invoice created and finalized');
      setFormOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create invoice');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Invoices</h1>
        </div>
        {canCreate && (
          <Button onClick={openNewInvoice} className="shrink-0">
            <Plus className="size-4" />
            New invoice
          </Button>
        )}
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>New sales invoice</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Customer</Label>
                <SearchableSelect
                  items={(customersQuery.data ?? []).map((customer) => ({ value: customer.id, label: customer.name }))}
                  value={customerId}
                  onValueChange={(value) => setCustomerId(value ?? '')}
                  placeholder="Select customer"
                  onTriggerKeyDown={(event) => {
                    if (event.key === 'Tab' && !event.shiftKey) {
                      event.preventDefault();
                      const firstRow = items[0];
                      const targetId = firstRow.sizeOption === 'SELF'
                        ? `sales-invoice-product-${firstRow.key}`
                        : `sales-invoice-quantity-${firstRow.key}`;
                      document.getElementById(targetId)?.focus();
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="advanceReceived">Advance Received</Label>
                <Input
                  id="advanceReceived"
                  type="number"
                  min="0"
                  max={invoiceTotal || undefined}
                  step="0.01"
                  value={advanceReceived}
                  onChange={(e) => setAdvanceReceived(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="termsText">Terms</Label>
                <Input id="termsText" value={termsText} onChange={(e) => setTermsText(e.target.value)} placeholder="e.g. Net 30" />
              </div>
            </div>

              <div className="space-y-2">
                <Label>Items</Label>
                <div className="overflow-x-auto rounded-lg border border-border/70">
                  <table className="w-full min-w-[1080px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground divide-x divide-border/50">
                        <th className="w-[7%] px-2 py-1.5 text-left font-medium">Quantity</th>
                        <th className="w-[18%] px-2 py-1.5 text-left font-medium">Product</th>
                        <th className="w-[12%] px-2 py-1.5 text-left font-medium">Location</th>
                        <th className="w-[13%] px-2 py-1.5 text-left font-medium">Size Formula</th>
                        <th className="w-[8%] px-2 py-1.5 text-left font-medium">Width</th>
                        <th className="w-[8%] px-2 py-1.5 text-left font-medium">Length</th>
                        <th className="w-[8%] px-2 py-1.5 text-left font-medium">Rate</th>
                        <th className="w-[11%] px-2 py-1.5 text-right font-medium">Total Square Feet</th>
                        <th className="w-[11%] px-2 py-1.5 text-right font-medium">Amount or Price</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {items.map((row, idx) => {
                        const sqft = previewSqft(row);
                        const amount = previewAmount(row);
                        const isLastBlankRow = idx === items.length - 1 && !row.productId;
                        return (
                          <tr key={row.key} className="divide-x divide-border/50">
                            <td className="p-0 align-top">
                              {row.sizeOption === 'SELF' ? (
                                <div className="px-2 py-1.5 text-muted-foreground">—</div>
                              ) : (
                                <Input
                                  id={`sales-invoice-quantity-${row.key}`}
                                  className="h-8 rounded-none border-0 bg-transparent px-2 text-sm focus-visible:ring-1 focus-visible:ring-inset"
                                  type="number"
                                  step="1"
                                  value={row.quantity}
                                  onChange={(event) => updateItem(row.key, { quantity: event.target.value })}
                                />
                              )}
                            </td>
                            <td className="p-0 align-top">
                              <SearchableSelect
                                items={(productsQuery.data ?? []).map((product) => ({ value: product.id, label: product.name }))}
                                value={row.productId}
                                onValueChange={(value) => updateItem(row.key, { productId: value })}
                                placeholder="Select product"
                                triggerId={`sales-invoice-product-${row.key}`}
                                openOnFocus
                                onTriggerKeyDown={(event) => {
                                  if (event.key === 'Tab' && !event.shiftKey) {
                                    event.preventDefault();
                                    document.getElementById(`sales-invoice-location-${row.key}`)?.focus();
                                  }
                                }}
                                triggerClassName="h-8 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus:ring-1 focus:ring-inset"
                              />
                            </td>
                            <td className="p-0 align-top">
                              <Select
                                items={Object.fromEntries((locationsQuery.data ?? []).map((location) => [location.id, location.name]))}
                                value={effectiveLocationId}
                                onValueChange={(value) => setLocationId(value ?? defaultFactoryLocation?.id ?? '')}
                              >
                                <SelectTrigger
                                  id={`sales-invoice-location-${row.key}`}
                                  className="h-8 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus:ring-1 focus:ring-inset"
                                >
                                  <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(locationsQuery.data ?? []).map((location) => (
                                    <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-0 align-top">
                              <Select
                                items={Object.fromEntries(SIZE_OPTIONS.map((opt) => [opt.value, opt.label]))}
                                value={row.sizeOption}
                                onValueChange={(v) => updateItem(row.key, { sizeOption: v ?? 'FIX' })}
                              >
                                <SelectTrigger className="h-8 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus:ring-1 focus:ring-inset">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SIZE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-0 align-top">
                              {row.sizeOption === 'SELF' ? (
                                <div className="px-2 py-1.5 text-muted-foreground">—</div>
                              ) : (
                                  <Input
                                    className="h-8 rounded-none border-0 bg-transparent px-2 text-sm focus-visible:ring-1 focus-visible:ring-inset"
                                    type="number"
                                    step="0.01"
                                    value={row.width}
                                    placeholder={row.sizeOption !== 'FIX' ? row.sizeOption : undefined}
                                    onChange={(event) => updateItem(row.key, { width: event.target.value })}
                                  />
                              )}
                            </td>
                            <td className="p-0 align-top">
                              {row.sizeOption === 'SELF' ? (
                                <div className="px-2 py-1.5 text-muted-foreground">—</div>
                              ) : (
                                  <Input
                                    className="h-8 rounded-none border-0 bg-transparent px-2 text-sm focus-visible:ring-1 focus-visible:ring-inset"
                                    type="number"
                                    step="0.01"
                                    value={row.length}
                                    onChange={(event) => updateItem(row.key, { length: event.target.value })}
                                  />
                              )}
                            </td>
                            <td className="p-0 align-top">
                              <Input
                                className="h-8 rounded-none border-0 bg-transparent px-2 text-sm focus-visible:ring-1 focus-visible:ring-inset"
                                type="number"
                                step="0.01"
                                value={row.rate}
                                onChange={(event) => updateItem(row.key, { rate: event.target.value })}
                              />
                            </td>
                            <td className="p-0 text-right align-top font-mono">
                              {row.sizeOption === 'SELF' ? (
                                <Input
                                  className="h-8 rounded-none border-0 bg-transparent px-2 text-right font-mono text-sm focus-visible:ring-1 focus-visible:ring-inset"
                                  type="number"
                                  step="0.01"
                                  placeholder="Sq ft"
                                  value={row.sqft}
                                  onChange={(event) => updateItem(row.key, { sqft: event.target.value })}
                                />
                              ) : (
                                <div className="px-2 py-1.5">{sqft !== null ? sqft.toLocaleString() : '—'}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right align-top font-mono whitespace-nowrap">
                              {amount !== null ? amount.toLocaleString() : '—'}
                            </td>
                            <td className="p-0 align-top">
                              {!isLastBlankRow && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => removeItem(row.key)}
                                  disabled={items.length <= 1}
                                >
                                  ✕
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="ml-auto w-full max-w-sm rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-4 text-muted-foreground">
                  <span>T. Sq. Ft.</span>
                  <span className="font-mono text-foreground">{formatAmount(invoiceSquareFeet)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                  <span>Gross Total</span>
                  <span className="font-mono text-foreground">{formatAmount(invoiceSubtotal)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                  <span>Previous Balance</span>
                  <span className="font-mono text-foreground">{formatAmount(invoicePreviousBalance)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <span>Total Amount</span>
                  <span className="font-mono">{formatAmount(invoiceTotal)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                  <span>Received</span>
                  <span className="font-mono text-foreground">{formatAmount(invoiceAdvance)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-border/70 pt-2 text-base font-semibold">
                  <span>Balance</span>
                  <span className="font-mono">{formatAmount(invoiceRemaining)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : 'Create invoice'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Invoices</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search number or customer"
              className="pl-8"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {invoicesQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Advance Received</TableHead>
                    <TableHead className="text-right">Remaining Amount</TableHead>
                    <TableHead className="text-right">Delivery Order / Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesQuery.data?.data.length ? (
                    invoicesQuery.data.data.map((inv) => (
                      <Fragment key={inv.id}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}>
                          <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                          <TableCell>{inv.customer.name}</TableCell>
                          <TableCell>{inv.location.name}</TableCell>
                          <TableCell className="text-right font-mono">{Number(inv.totalAmount).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{Number(inv.advanceReceived).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">
                            {Math.max(0, Number(inv.totalAmount) - Number(inv.advanceReceived)).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openPdfInNewTab(`/sales-invoices/${inv.id}/delivery-order/pdf`).catch(() => toast.error('Could not open delivery order'))
                              }
                            >
                              Delivery Order
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPdfInNewTab(`/sales-invoices/${inv.id}/pdf`).catch(() => toast.error('Could not open PDF'))}
                            >
                              PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expandedId === inv.id && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30">
                              <div className="text-sm space-y-1 py-2">
                                {inv.termsText && <p className="text-muted-foreground">Terms: {inv.termsText}</p>}
                                {inv.cancelReason && <p className="text-destructive">Cancelled: {inv.cancelReason}</p>}
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Size Details</TableHead>
                                        <TableHead className="text-right">Qty / Result</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {inv.items.map((item) => {
                                        const p = item.inputParameters ?? {};
                                        return (
                                          <TableRow key={item.id}>
                                            <TableCell>{item.product.name}</TableCell>
                                            <TableCell className="text-muted-foreground">{p.description || '—'}</TableCell>
                                            <TableCell className="text-muted-foreground">{dimensionSummary(p)}</TableCell>
                                            <TableCell className="text-right font-mono">{Number(item.quantity).toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono">{Number(item.rate).toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono">{Number(item.amount).toLocaleString()}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                      <TableRow>
                                        <TableCell colSpan={5} className="text-right text-muted-foreground">
                                        Total / Advance / Remaining
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {Number(inv.totalAmount).toLocaleString()} / {Number(inv.advanceReceived).toLocaleString()} /{' '}
                                        {Math.max(0, Number(inv.totalAmount) - Number(inv.advanceReceived)).toLocaleString()}
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No sales invoices yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {invoicesQuery.data && invoicesQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {invoicesQuery.data.page} of {invoicesQuery.data.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= invoicesQuery.data.totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
