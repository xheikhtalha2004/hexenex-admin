'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
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
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Customer {
  id: string;
  name: string;
}
interface Location {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
}
interface InventoryBalance {
  productId: string;
  locationId: string;
  quantity: string;
}
interface SalesInvoiceItem {
  id: string;
  quantity: string;
  rate: string;
  amount: string;
  product: { name: string };
}
interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  invoiceDate: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
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

interface DraftItemRow {
  key: number;
  productId: string;
  quantity: string;
  rate: string;
}

let rowKeySeq = 0;
function newRow(): DraftItemRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, productId: '', quantity: '', rate: '' };
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
  const canFinalize = hasPermission('sales_invoice.finalize');
  const canCancel = hasPermission('sales_invoice.cancel');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [termsText, setTermsText] = useState('');
  const [items, setItems] = useState<DraftItemRow[]>([newRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmFinalizeId, setConfirmFinalizeId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const customersQuery = useQuery({ queryKey: ['customers-picker'], queryFn: () => apiClient.get<Customer[]>('/customers/picker') });
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: () => apiClient.get<Location[]>('/locations') });
  const productsQuery = useQuery({ queryKey: ['products-picker'], queryFn: () => apiClient.get<Product[]>('/product-picker') });
  const balancesQuery = useQuery({
    queryKey: ['inventory-balances-for-invoice'],
    queryFn: () => apiClient.get<InventoryBalance[]>('/inventory/balances'),
  });

  // SIN-01: Factory is the default location on the create form until the user picks a
  // different one — derived at render time rather than synced via an effect, so there is
  // never a moment where the field is blank before an effect catches up.
  const defaultFactoryLocation = locationsQuery.data?.find((l) => l.name.toLowerCase().includes('factory'));
  const effectiveLocationId = locationId || defaultFactoryLocation?.id || '';

  // SIN-05: drafts and PDFs are allowed at zero/insufficient stock, but the operator should
  // still clearly see the shortfall before finalizing — this looks up the live balance for a
  // row's product at the chosen location without blocking anything.
  function stockWarning(row: DraftItemRow): string | null {
    if (!row.productId || !effectiveLocationId || !row.quantity) return null;
    const balance = balancesQuery.data?.find((b) => b.productId === row.productId && b.locationId === effectiveLocationId);
    const available = balance ? Number(balance.quantity) : 0;
    const requested = Number(row.quantity);
    if (requested > available) {
      return `Only ${available.toLocaleString()} sq ft available at this location — this line can still be drafted, but finalizing will be blocked until stock is sufficient.`;
    }
    return null;
  }
  const invoicesQuery = useQuery({
    queryKey: ['sales-invoices', page],
    queryFn: () => apiClient.get<Paginated<SalesInvoice>>(`/sales-invoices?page=${page}&pageSize=20`),
  });

  function updateItem(key: number, patch: Partial<DraftItemRow>) {
    setItems((rows) => {
      const next = rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
      // Grid-style entry: as soon as the last row has a product on it, silently append a
      // fresh blank row underneath so there is never a need to click "Add item" by hand.
      const last = next[next.length - 1];
      if (last.productId) return [...next, newRow()];
      return next;
    });
  }
  function removeItem(key: number) {
    setItems((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  }
  function resetForm() {
    setCustomerId('');
    setLocationId('');
    setDiscountAmount('0');
    setTermsText('');
    setItems([newRow()]);
  }
  function openNewInvoice() {
    resetForm();
    setFormOpen(true);
  }

  const finalizeMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/sales-invoices/${id}/finalize`),
    onSuccess: () => {
      toast.success('Invoice finalized — stock deducted, customer ledger updated');
      setConfirmFinalizeId(null);
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not finalize invoice'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => apiClient.post(`/sales-invoices/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Invoice cancelled — stock and balance reversed');
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not cancel invoice'),
  });

  const finalizeTarget = invoicesQuery.data?.data.find((i) => i.id === confirmFinalizeId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !effectiveLocationId) {
      toast.error('Select a customer and a location');
      return;
    }
    const validItems = items.filter((r) => r.productId && r.quantity && r.rate);
    if (validItems.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/sales-invoices', {
        customerId,
        locationId: effectiveLocationId,
        discountAmount: Number(discountAmount) || 0,
        termsText: termsText || undefined,
        items: validItems.map((r) => ({ productId: r.productId, quantity: Number(r.quantity), rate: Number(r.rate) })),
      });
      toast.success('Sales invoice created as draft');
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
          <p className="text-muted-foreground">
            Finalizing deducts stock and posts the customer ledger atomically. Cancelling a finalized invoice reverses both.
          </p>
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
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                  <Label>Customer</Label>
                  <SearchableSelect
                    items={(customersQuery.data ?? []).map(c => ({ value: c.id, label: c.name }))}
                    value={customerId}
                    onValueChange={(v) => setCustomerId(v ?? '')}
                    placeholder="Select customer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select
                    items={Object.fromEntries((locationsQuery.data ?? []).map((l) => [l.id, l.name]))}
                    value={effectiveLocationId}
                    onValueChange={(v) => setLocationId(v ?? '')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locationsQuery.data?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountAmount">Discount</Label>
                  <Input id="discountAmount" type="number" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="termsText">Terms</Label>
                  <Input id="termsText" value={termsText} onChange={(e) => setTermsText(e.target.value)} placeholder="e.g. Net 30" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Items</Label>
                <div className="overflow-x-auto rounded-lg border border-border/70">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground divide-x divide-border/50">
                        <th className="w-[45%] px-2 py-1.5 text-left font-medium">Product</th>
                        <th className="w-[18%] px-2 py-1.5 text-left font-medium">Qty (sq ft)</th>
                        <th className="w-[18%] px-2 py-1.5 text-left font-medium">Rate</th>
                        <th className="w-[15%] px-2 py-1.5 text-right font-medium">Amount</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {items.map((row, idx) => {
                        const amount = row.quantity && row.rate ? Number(row.quantity) * Number(row.rate) : null;
                        const isLastBlankRow = idx === items.length - 1 && !row.productId;
                        const warning = stockWarning(row);
                        return (
                          <tr key={row.key} className="divide-x divide-border/50 align-top">
                            <td className="p-0">
                              <SearchableSelect
                                items={(productsQuery.data ?? []).map(p => ({ value: p.id, label: p.name }))}
                                value={row.productId}
                                onValueChange={(val) => {
                                  updateItem(row.key, { productId: val });
                                  const product = productsQuery.data?.find((p) => p.id === val);
                                  if (product) {
                                    updateItem(row.key, { rate: product.defaultSellingRate.toString() });
                                  }
                                }}
                                placeholder="Select product"
                                triggerClassName="h-8 text-sm rounded-none border-0 bg-transparent focus:ring-1 focus:ring-inset px-2 shadow-none"
                              />
                              {warning && <p className="mt-1 text-xs text-warning">{warning}</p>}
                            </td>
                            <td className="p-0">
                              <Input
                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                                type="number"
                                step="0.01"
                                value={row.quantity}
                                onChange={(e) => updateItem(row.key, { quantity: e.target.value })}
                              />
                            </td>
                            <td className="p-0">
                              <Input
                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                                type="number"
                                step="0.01"
                                value={row.rate}
                                onChange={(e) => updateItem(row.key, { rate: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{amount !== null ? amount.toLocaleString() : '—'}</td>
                            <td className="p-0">
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

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : 'Create draft'}
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
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
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
                          <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                            {inv.status === 'DRAFT' && canFinalize && (
                              <Button size="sm" disabled={finalizeMutation.isPending} onClick={() => setConfirmFinalizeId(inv.id)}>
                                Finalize
                              </Button>
                            )}
                            {inv.status === 'FINALIZED' && canCancel && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={cancelMutation.isPending}
                                onClick={() => {
                                  setCancelReason('');
                                  setCancelTarget(inv.id);
                                }}
                              >
                                Cancel
                              </Button>
                            )}
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
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="text-sm space-y-1 py-2">
                                {inv.termsText && <p className="text-muted-foreground">Terms: {inv.termsText}</p>}
                                {inv.cancelReason && <p className="text-destructive">Cancelled: {inv.cancelReason}</p>}
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead className="text-right">Rate</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {inv.items.map((item) => (
                                      <TableRow key={item.id}>
                                        <TableCell>{item.product.name}</TableCell>
                                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                        <TableCell className="text-right font-mono">{item.rate}</TableCell>
                                        <TableCell className="text-right font-mono">{item.amount}</TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow>
                                      <TableCell colSpan={3} className="text-right text-muted-foreground">
                                        Subtotal / Discount
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {Number(inv.subtotal).toLocaleString()} / {Number(inv.discountAmount).toLocaleString()}
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
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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

      <ConfirmDialog
        open={!!confirmFinalizeId}
        onOpenChange={(open) => !open && setConfirmFinalizeId(null)}
        title="Finalize this sales invoice?"
        description={
          finalizeTarget ? (
            <>
              Invoice <strong>{finalizeTarget.invoiceNumber}</strong> for <strong>{finalizeTarget.customer.name}</strong> at{' '}
              <strong>{finalizeTarget.location.name}</strong>, total <strong>{Number(finalizeTarget.totalAmount).toLocaleString()}</strong>.
              This deducts stock and posts the customer ledger, and cannot be undone except through cancellation.
            </>
          ) : null
        }
        confirmLabel="Finalize"
        isConfirming={finalizeMutation.isPending}
        onConfirm={() => confirmFinalizeId && finalizeMutation.mutate(confirmFinalizeId)}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this finalized invoice?"
        destructive
        description={
          <div className="space-y-3">
            <p>This reverses the stock deduction and the customer ledger entry. This is an audited action — enter a reason.</p>
            <Input
              placeholder="Reason for cancellation"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              autoFocus
            />
          </div>
        }
        confirmLabel="Cancel invoice"
        isConfirming={cancelMutation.isPending}
        onConfirm={() => cancelTarget && cancelMutation.mutate({ id: cancelTarget, reason: cancelReason || undefined })}
      />
    </div>
  );
}
