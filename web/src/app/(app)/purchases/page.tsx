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
interface PurchaseItem {
  id: string;
  quantity: string;
  unitCost: string;
  amount: string;
  landedUnitCost: string;
  product: { name: string };
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
  quantity: string;
  unitCost: string;
}

export default function PurchasesPage() {
  return (
    <PermissionGate permission="purchase_invoice.view">
      <PurchasesContent />
    </PermissionGate>
  );
}

let rowKeySeq = 0;
function newRow(): DraftItemRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, productId: '', quantity: '', unitCost: '' };
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

  function updateItem(key: number, patch: Partial<DraftItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
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
    if (!supplierId || !locationId) {
      toast.error('Select a supplier and a location');
      return;
    }
    const validItems = items.filter((r) => r.productId && r.quantity && r.unitCost);
    if (validItems.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/purchases', {
        supplierId,
        locationId,
        freightCost: Number(freightCost) || 0,
        otherDirectCosts: Number(otherDirectCosts) || 0,
        freightAllocationMethod,
        items: validItems.map((r) => ({ productId: r.productId, quantity: Number(r.quantity), unitCost: Number(r.unitCost) })),
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
                  <Label>Receiving location</Label>
                  <Select
                    value={locationId}
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
              </div>

              <div className="space-y-2 max-w-xs">
                <Label>Allocate freight/other costs</Label>
                <Select value={freightAllocationMethod} onValueChange={(v) => setFreightAllocationMethod((v as 'BY_VALUE' | 'BY_QUANTITY') ?? 'BY_VALUE')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BY_VALUE">By item value</SelectItem>
                    <SelectItem value="BY_QUANTITY">By item quantity</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Items</Label>
                {items.map((row) => (
                  <div key={row.key} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-6">
                      <SearchableSelect
                        items={(productsQuery.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                        value={row.productId}
                        onValueChange={(v) => updateItem(row.key, { productId: v ?? '' })}
                        placeholder="Select product"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Qty (sq ft)"
                        value={row.quantity}
                        onChange={(e) => updateItem(row.key, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Unit cost"
                        value={row.unitCost}
                        onChange={(e) => updateItem(row.key, { unitCost: e.target.value })}
                      />
                    </div>
                    <div className="col-span-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => removeItem(row.key)} disabled={items.length <= 1}>
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setItems((rows) => [...rows, newRow()])}>
                  Add item
                </Button>
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
                                      <TableHead>Product</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead className="text-right">Unit cost</TableHead>
                                      <TableHead className="text-right">Landed cost</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {inv.items.map((item) => (
                                      <TableRow key={item.id}>
                                        <TableCell>{item.product.name}</TableCell>
                                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                        <TableCell className="text-right font-mono">{item.unitCost}</TableCell>
                                        <TableCell className="text-right font-mono">{item.landedUnitCost}</TableCell>
                                        <TableCell className="text-right font-mono">{item.amount}</TableCell>
                                      </TableRow>
                                    ))}
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
