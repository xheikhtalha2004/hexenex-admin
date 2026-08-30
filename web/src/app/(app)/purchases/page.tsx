'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
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
import { SearchableSelect } from '@/components/searchable-select';

interface Supplier {
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
interface PurchaseItemInputParameters {
  sizeOption: string;
  quantity: number | null;
  width: number | null;
  length: number | null;
  sqft: number | null;
  rate: number;
}
interface PurchaseItem {
  id: string;
  quantity: string;
  unitCost: string;
  amount: string;
  landedUnitCost: string;
  product: { name: string };
  inputParameters?: PurchaseItemInputParameters | null;
}
interface PurchaseInvoice {
  id: string;
  purchaseInvoiceNumber: string;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  invoiceDate: string;
  subtotal: string;
  supplierPayableAmount: string;
  freightCost: string;
  otherDirectCosts: string;
  supplier: Supplier;
  location: Location;
  items: PurchaseItem[];
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
  sizeOption: string;
  quantity: string;
  width: string;
  length: string;
  sqft: string;
  unitCost: string;
}

const SIZE_OPTIONS: { value: string; label: string }[] = [
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

export default function PurchasesPage() {
  return (
    <PermissionGate permission="purchase_invoice.view">
      <PurchasesContent />
    </PermissionGate>
  );
}

let rowKeySeq = 0;
function newRow(productId = ''): DraftItemRow {
  rowKeySeq += 1;
  return {
    key: rowKeySeq,
    productId,
    sizeOption: 'FIX',
    quantity: '',
    width: '',
    length: '',
    sqft: '',
    unitCost: '',
  };
}

function formatAmount(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isRowComplete(row: DraftItemRow): boolean {
  return Boolean(row.productId && previewSqft(row) !== null && Number(row.unitCost) > 0);
}

function previewSqft(row: DraftItemRow): number | null {
  if (row.sizeOption === 'SELF') {
    const sqft = Number(row.sqft);
    return Number.isFinite(sqft) && sqft > 0 ? sqft : null;
  }

  const pieceQuantity = Number(row.quantity);
  const length = Number(row.length);
  const width = row.sizeOption === 'FIX' ? Number(row.width) : Number(row.sizeOption);
  if (
    !Number.isFinite(pieceQuantity) ||
    pieceQuantity <= 0 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(length) ||
    length <= 0
  ) {
    return null;
  }
  return Math.round(((pieceQuantity * width * length) / 144) * 100) / 100;
}

function previewAmount(row: DraftItemRow): number | null {
  const sqft = previewSqft(row);
  const unitCost = Number(row.unitCost);
  if (sqft === null || !Number.isFinite(unitCost) || unitCost <= 0) return null;
  return Math.round(sqft * unitCost * 100) / 100;
}

function PurchasesContent() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('purchase_invoice.create');
  const canFinalize = hasPermission('purchase_invoice.finalize');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const suppliersQuery = useQuery({ queryKey: ['suppliers-picker'], queryFn: () => apiClient.get<Supplier[]>('/suppliers/picker') });
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: () => apiClient.get<Location[]>('/locations') });
  const productsQuery = useQuery({ queryKey: ['products-picker'], queryFn: () => apiClient.get<Product[]>('/product-picker') });
  const purchasesQuery = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => apiClient.get<Paginated<PurchaseInvoice>>(`/purchases?page=${page}&pageSize=20`),
  });

  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [freightCost, setFreightCost] = useState('0');
  const [otherDirectCosts, setOtherDirectCosts] = useState('0');
  const [freightAllocationMethod, setFreightAllocationMethod] = useState<'BY_VALUE' | 'BY_QUANTITY'>('BY_VALUE');
  const [items, setItems] = useState<DraftItemRow[]>([newRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultFactoryLocation = locationsQuery.data?.find((location) => location.name.toLowerCase().includes('factory'));
  const effectiveLocationId = locationId || defaultFactoryLocation?.id || '';

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
    setSupplierId('');
    setLocationId('');
    setFreightCost('0');
    setOtherDirectCosts('0');
    setFreightAllocationMethod('BY_VALUE');
    setItems([newRow()]);
  }

  const finalizeMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/purchases/${id}/finalize`),
    onSuccess: () => {
      toast.success('Purchase invoice finalized — stock received, supplier ledger updated');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not finalize purchase invoice'),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId || !effectiveLocationId) {
      toast.error('Select a supplier and a location');
      return;
    }
    const validItems = items.filter(isRowComplete);
    if (validItems.length === 0) {
      toast.error('Add at least one complete item (product, dimensions, and rate)');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/purchases', {
        supplierId,
        locationId: effectiveLocationId,
        freightCost: Number(freightCost) || 0,
        otherDirectCosts: Number(otherDirectCosts) || 0,
        freightAllocationMethod,
        items: validItems.map((r) => ({
          productId: r.productId,
          sizeOption: r.sizeOption || 'FIX',
          quantity: r.quantity ? Number(r.quantity) : undefined,
          width: r.width ? Number(r.width) : undefined,
          length: r.length ? Number(r.length) : undefined,
          sqft: r.sqft ? Number(r.sqft) : undefined,
          unitCost: Number(r.unitCost),
        })),
      });
      toast.success('Purchase invoice created as draft');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create purchase invoice');
    } finally {
      setIsSubmitting(false);
    }
  }

  const purchaseSquareFeet = items.reduce((sum, row) => sum + (previewSqft(row) ?? 0), 0);
  const purchaseSubtotal = items.reduce((sum, row) => sum + (previewAmount(row) ?? 0), 0);
  const purchaseFreight = Math.max(0, Number(freightCost) || 0);
  const purchaseOtherCosts = Math.max(0, Number(otherDirectCosts) || 0);
  const purchaseLandedTotal = purchaseSubtotal + purchaseFreight + purchaseOtherCosts;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Purchases</h1>
        <p className="text-muted-foreground">
          Create as a draft, then finalize to receive stock and post the supplier payable — both happen atomically.
        </p>
      </div>

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New purchase invoice</CardTitle>
            <CardDescription>Freight and other direct costs are allocated across items into the landed unit cost.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <SearchableSelect
                    items={(suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                    value={supplierId}
                    onValueChange={(v) => setSupplierId(v ?? '')}
                    placeholder="Select supplier"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="freightCost">Freight / inward charges</Label>
                  <Input id="freightCost" type="number" step="0.01" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otherDirectCosts">Other direct costs</Label>
                  <Input
                    id="otherDirectCosts"
                    type="number"
                    step="0.01"
                    value={otherDirectCosts}
                    onChange={(e) => setOtherDirectCosts(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Allocate freight/other costs</Label>
                  <Select
                    items={{ BY_VALUE: 'By item value', BY_QUANTITY: 'By item quantity' }}
                    value={freightAllocationMethod}
                    onValueChange={(value) => setFreightAllocationMethod((value as 'BY_VALUE' | 'BY_QUANTITY') ?? 'BY_VALUE')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BY_VALUE">By item value</SelectItem>
                      <SelectItem value="BY_QUANTITY">By item quantity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Items</Label>
                <div className="overflow-x-auto rounded-lg border border-border/70">
                  <table className="w-full min-w-[1180px] text-sm">
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
                      {items.map((row, index) => {
                        const squareFeet = previewSqft(row);
                        const amount = previewAmount(row);
                        const isLastBlankRow = index === items.length - 1 && !row.productId;
                        return (
                          <tr key={row.key} className="divide-x divide-border/50">
                            <td className="p-0 align-top">
                              {row.sizeOption === 'SELF' ? (
                                <div className="px-2 py-1.5 text-muted-foreground">—</div>
                              ) : (
                                <Input
                                  className="h-8 rounded-none border-0 bg-transparent px-2 text-sm focus-visible:ring-1 focus-visible:ring-inset"
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={row.quantity}
                                  onChange={(event) => updateItem(row.key, { quantity: event.target.value })}
                                />
                              )}
                            </td>
                            <td className="p-0 align-top">
                              <SearchableSelect
                                items={(productsQuery.data ?? []).map((product) => ({ value: product.id, label: product.name }))}
                                value={row.productId}
                                onValueChange={(value) => updateItem(row.key, { productId: value ?? '' })}
                                placeholder="Select product"
                                openOnFocus
                                triggerClassName="h-8 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus:ring-1 focus:ring-inset"
                              />
                            </td>
                            <td className="p-0 align-top">
                              <Select
                                items={Object.fromEntries((locationsQuery.data ?? []).map((location) => [location.id, location.name]))}
                                value={effectiveLocationId}
                                onValueChange={(value) => setLocationId(value ?? defaultFactoryLocation?.id ?? '')}
                              >
                                <SelectTrigger className="h-8 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus:ring-1 focus:ring-inset">
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
                                items={Object.fromEntries(SIZE_OPTIONS.map((option) => [option.value, option.label]))}
                                value={row.sizeOption}
                                onValueChange={(value) => updateItem(row.key, { sizeOption: value ?? 'FIX' })}
                              >
                                <SelectTrigger className="h-8 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus:ring-1 focus:ring-inset">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SIZE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                                  min="0"
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
                                  min="0"
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
                                min="0"
                                value={row.unitCost}
                                onChange={(event) => updateItem(row.key, { unitCost: event.target.value })}
                              />
                            </td>
                            <td className="p-0 text-right align-top font-mono">
                              {row.sizeOption === 'SELF' ? (
                                <Input
                                  className="h-8 rounded-none border-0 bg-transparent px-2 text-right font-mono text-sm focus-visible:ring-1 focus-visible:ring-inset"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="Sq ft"
                                  value={row.sqft}
                                  onChange={(event) => updateItem(row.key, { sqft: event.target.value })}
                                />
                              ) : (
                                <div className="px-2 py-1.5">{squareFeet !== null ? formatAmount(squareFeet) : '—'}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right align-top font-mono">
                              {amount !== null ? formatAmount(amount) : '—'}
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
                  <span className="font-mono text-foreground">{formatAmount(purchaseSquareFeet)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                  <span>Gross Total</span>
                  <span className="font-mono text-foreground">{formatAmount(purchaseSubtotal)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                  <span>Freight / Inward Charges</span>
                  <span className="font-mono text-foreground">{formatAmount(purchaseFreight)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                  <span>Other Direct Costs</span>
                  <span className="font-mono text-foreground">{formatAmount(purchaseOtherCosts)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-border/70 pt-2 text-base font-semibold">
                  <span>Total Amount</span>
                  <span className="font-mono">{formatAmount(purchaseLandedTotal)}</span>
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create draft'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase invoices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {purchasesQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchasesQuery.data?.data.length ? (
                    purchasesQuery.data.data.map((inv) => (
                      <Fragment key={inv.id}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}>
                          <TableCell className="font-medium">{inv.purchaseInvoiceNumber}</TableCell>
                          <TableCell>{inv.supplier.name}</TableCell>
                          <TableCell>{inv.location.name}</TableCell>
                          <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-mono">{Number(inv.subtotal).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{Number(inv.supplierPayableAmount).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === 'FINALIZED' ? 'success' : inv.status === 'DRAFT' ? 'secondary' : 'destructive'}>
                              {inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {inv.status === 'DRAFT' && canFinalize && (
                              <Button
                                size="sm"
                                disabled={finalizeMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  finalizeMutation.mutate(inv.id);
                                }}
                              >
                                Finalize
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedId === inv.id && (
                          <TableRow key={`${inv.id}-detail`}>
                            <TableCell colSpan={8} className="bg-muted/30">
                              <div className="text-sm space-y-1 py-2">
                                <p className="text-muted-foreground">
                                  Freight: {Number(inv.freightCost).toLocaleString()} · Other costs:{' '}
                                  {Number(inv.otherDirectCosts).toLocaleString()}
                                </p>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead>Product</TableHead>
                                      <TableHead>Location</TableHead>
                                      <TableHead>Size</TableHead>
                                      <TableHead className="text-right">Width</TableHead>
                                      <TableHead className="text-right">Length</TableHead>
                                      <TableHead className="text-right">Sq Ft</TableHead>
                                      <TableHead className="text-right">Rate</TableHead>
                                      <TableHead className="text-right">Landed rate</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {inv.items.map((item) => {
                                      const parameters = item.inputParameters;
                                      const sizeOption = parameters?.sizeOption ?? '—';
                                      const isSelf = sizeOption === 'SELF';
                                      const width = isSelf
                                        ? '—'
                                        : parameters?.width ?? (sizeOption !== 'FIX' && sizeOption !== '—' ? sizeOption : '—');
                                      return (
                                        <TableRow key={item.id}>
                                          <TableCell className="text-right font-mono">{isSelf ? '—' : parameters?.quantity ?? '—'}</TableCell>
                                          <TableCell>{item.product.name}</TableCell>
                                          <TableCell>{inv.location.name}</TableCell>
                                          <TableCell>{sizeOption}</TableCell>
                                          <TableCell className="text-right font-mono">{width}</TableCell>
                                          <TableCell className="text-right font-mono">{isSelf ? '—' : parameters?.length ?? '—'}</TableCell>
                                          <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                          <TableCell className="text-right font-mono">{item.unitCost}</TableCell>
                                          <TableCell className="text-right font-mono">{item.landedUnitCost}</TableCell>
                                          <TableCell className="text-right font-mono">{item.amount}</TableCell>
                                        </TableRow>
                                      );
                                    })}
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
                        No purchase invoices yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {purchasesQuery.data && purchasesQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {purchasesQuery.data.page} of {purchasesQuery.data.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= purchasesQuery.data.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
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
