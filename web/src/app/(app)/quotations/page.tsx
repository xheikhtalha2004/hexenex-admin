'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Customer {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
}
interface QuotationItemInputParameters {
  description: string | null;
  sizeOption: string | null;
  quantity: number | null;
  width: number | null;
  length: number | null;
  sqft: number | null;
  rate: number;
}
interface QuotationItem {
  id: string;
  computedQuantity: string;
  computedRate: string;
  computedAmount: string;
  product: { id: string; name: string };
  inputParameters: QuotationItemInputParameters;
}
interface Quotation {
  id: string;
  quotationNumber: string;
  status: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'EXPIRED';
  quotationDate: string;
  validUntil: string | null;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  advanceReceived: string;
  notes: string | null;
  customer: Customer;
  items: QuotationItem[];
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

/** "Fix" = a manually typed custom width. The numeric options are the factory's standard
 * counter widths in inches. "Self" bypasses the qty/width/length formula and takes a directly
 * typed sq ft — must match apps/api/src/quotation-engine/sqft-dimensions.strategy.ts exactly. */
const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: 'FIX', label: 'Fix (custom width)' },
  { value: '6', label: '6 in (standard)' },
  { value: '8', label: '8 in (standard)' },
  { value: '12', label: '12 in (standard)' },
  { value: '18', label: '18 in (standard)' },
  { value: '24', label: '24 in (standard)' },
  { value: '36', label: '36 in (standard)' },
  { value: '48', label: '48 in (standard)' },
  { value: '52', label: '52 in (standard)' },
  { value: 'SELF', label: 'Self (enter sq ft directly)' },
];

interface DraftItemRow {
  key: number;
  productId: string;
  description: string;
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
  return { key: rowKeySeq, productId, description: '', sizeOption: 'FIX', quantity: '', width: '', length: '', sqft: '', rate: '' };
}

/** Client-side mirror of the server formula, for a live preview only — the server remains
 * authoritative for the value actually saved. Returns null while required fields are incomplete. */
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


function dimensionSummary(p: QuotationItemInputParameters): string {
  if (!p.sizeOption) return '—';
  if (p.sizeOption === 'SELF') return 'Sq ft entered directly';
  const width = p.width != null ? p.width : (p.sizeOption !== 'FIX' ? p.sizeOption : '?');
  return `${p.quantity ?? '?'} pc(s) × ${width}in × ${p.length ?? '?'}in`;
}

export default function QuotationsPage() {
  return (
    <PermissionGate permission="quotation.view">
      <QuotationsContent />
    </PermissionGate>
  );
}

function QuotationsContent() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('quotation.create');
  const canEdit = hasPermission('quotation.edit');
  const canApprove = hasPermission('quotation.approve');
  const canDelete = hasPermission('quotation.delete');
  const canConvert = hasPermission('quotation.convert');
  const canAddCustomer = hasPermission('customer.manage');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [advanceReceived, setAdvanceReceived] = useState('0');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems] = useState<DraftItemRow[]>([newRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertLocationId, setConvertLocationId] = useState('');

  // QTN-02: create a customer inline without leaving the quotation form.
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const customersQuery = useQuery({ queryKey: ['customers-picker'], queryFn: () => apiClient.get<Customer[]>('/customers/picker') });
  const productsQuery = useQuery({ queryKey: ['products-picker'], queryFn: () => apiClient.get<Product[]>('/product-picker') });
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: () => apiClient.get<{ id: string; name: string }[]>('/locations') });
  const defaultFactoryLocation = locationsQuery.data?.find((location) => location.name.toLowerCase().includes('factory'));
  const effectiveConvertLocationId = convertLocationId || defaultFactoryLocation?.id || '';
  const quotationsQuery = useQuery({
    queryKey: ['quotations', page, search],
    queryFn: () =>
      apiClient.get<Paginated<Quotation>>(
        `/quotations?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const convertMutation = useMutation({
    mutationFn: ({ id, locationId }: { id: string; locationId: string }) =>
      apiClient.post(`/sales-invoices/from-quotation/${id}`, { locationId }),
    onSuccess: () => {
      toast.success('Converted to a finalized sales invoice');
      setConvertingId(null);
      setConvertLocationId('');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not convert quotation'),
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
    setEditingId(null);
    setCustomerId('');
    setAdvanceReceived('0');
    setNotes('');
    setValidUntil('');
    setItems([newRow()]);
  }
  function openNewQuotation() {
    resetForm();
    setFormOpen(true);
  }
  function startEdit(q: Quotation) {
    setEditingId(q.id);
    setCustomerId(q.customer.id);
    setAdvanceReceived(q.advanceReceived);
    setNotes(q.notes ?? '');
    setValidUntil(q.validUntil ? q.validUntil.slice(0, 10) : '');
    setItems(
      q.items.map((item) => {
        rowKeySeq += 1;
        const p = item.inputParameters;
        return {
          key: rowKeySeq,
          productId: item.product.id,
          description: p.description ?? '',
          sizeOption: p.sizeOption ?? 'FIX',
          quantity: p.quantity != null ? String(p.quantity) : '',
          width: p.width != null ? String(p.width) : '',
          length: p.length != null ? String(p.length) : '',
          sqft: p.sqft != null ? String(p.sqft) : '',
          rate: String(p.rate),
        };
      }),
    );
    setFormOpen(true);
  }

  const createCustomerMutation = useMutation({
    mutationFn: (payload: { name: string; phone?: string; address?: string }) => apiClient.post<Customer>('/customers', payload),
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: ['customers-picker'] });
      setCustomerId(customer.id);
      setNewCustomerOpen(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
      toast.success(`${customer.name} added and selected`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create customer'),
  });

  async function onCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerName.trim()) {
      toast.error('Enter a customer name');
      return;
    }
    setIsCreatingCustomer(true);
    try {
      await createCustomerMutation.mutateAsync({
        name: newCustomerName.trim(),
        phone: newCustomerPhone || undefined,
        address: newCustomerAddress || undefined,
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/quotations/${id}/approve`),
    onSuccess: () => {
      toast.success('Quotation approved');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not approve quotation'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => apiClient.post(`/quotations/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Quotation rejected');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not reject quotation'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/quotations/${id}`),
    onSuccess: () => {
      toast.success('Draft quotation deleted');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete quotation'),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast.error('Select a customer');
      return;
    }
    const validItems = items.filter(isRowComplete);
    if (validItems.length === 0) {
      toast.error('Add at least one complete item (product, size details, and rate)');
      return;
    }
    setIsSubmitting(true);
    if ((Number(advanceReceived) || 0) > quotationTotal) {
      toast.error('Advance received cannot exceed the total amount');
      setIsSubmitting(false);
      return;
    }
    const payload = {
      customerId,
      discountAmount: 0,
      advanceReceived: Number(advanceReceived) || 0,
      notes: notes || undefined,
      validUntil: validUntil || undefined,
      items: validItems.map((r) => ({
        productId: r.productId,
        description: r.description || undefined,
        sizeOption: r.sizeOption || 'FIX',
        quantity: r.quantity ? Number(r.quantity) : undefined,
        width: r.width ? Number(r.width) : undefined,
        length: r.length ? Number(r.length) : undefined,
        sqft: r.sqft ? Number(r.sqft) : undefined,
        rate: Number(r.rate),
      })),
    };
    try {
      if (editingId) {
        await apiClient.patch(`/quotations/${editingId}`, payload);
        toast.success('Quotation updated');
      } else {
        await apiClient.post('/quotations', payload);
        toast.success('Quotation created as draft');
      }
      setFormOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save quotation');
    } finally {
      setIsSubmitting(false);
    }
  }

  const quotationSubtotal = items.reduce((total, row) => total + (previewAmount(row) ?? 0), 0);
  const quotationTotal = quotationSubtotal;
  const quotationAdvance = Math.max(0, Number(advanceReceived) || 0);
  const quotationRemaining = Math.max(0, quotationTotal - quotationAdvance);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotations</h1>
        </div>
        {canCreate && (
          <Button onClick={openNewQuotation} className="shrink-0">
            <Plus className="size-4" />
            New quotation
          </Button>
        )}
      </div>

      {/* QTN-01: creation/edit form lives in a modal so the list stays visible behind it. */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit draft quotation' : 'New quotation'}</DialogTitle>
            <DialogDescription>Only draft quotations can be edited.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <div className="flex gap-1.5">
                  <SearchableSelect
                    items={(customersQuery.data ?? []).map(c => ({ value: c.id, label: c.name }))}
                    value={customerId}
                    onValueChange={(v) => setCustomerId(v ?? '')}
                    placeholder="Select customer"
                    triggerClassName="flex-1"
                  />
                  {canAddCustomer && (
                    <Button type="button" variant="outline" size="icon" title="Add new customer" onClick={() => setNewCustomerOpen(true)}>
                      <Plus className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="advanceReceived">Advance Received</Label>
                <Input
                  id="advanceReceived"
                  type="number"
                  min="0"
                  max={quotationTotal || undefined}
                  step="0.01"
                  value={advanceReceived}
                  onChange={(e) => setAdvanceReceived(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validUntil">Valid until</Label>
                <Input
                  id="validUntil"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-sm min-w-[1080px]">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground divide-x divide-border/50">
                      <th className="w-[7%] px-2 py-1.5 text-left font-medium">Quantity</th>
                      <th className="w-[18%] px-2 py-1.5 text-left font-medium">Product</th>
                      <th className="w-[12%] px-2 py-1.5 text-left font-medium">Description</th>
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
                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                                type="number"
                                step="1"
                                value={row.quantity}
                                onChange={(e) => updateItem(row.key, { quantity: e.target.value })}
                              />
                            )}
                          </td>
                          <td className="p-0 align-top">
                            <SearchableSelect
                              items={(productsQuery.data ?? []).map(p => ({ value: p.id, label: p.name }))}
                              value={row.productId}
                              onValueChange={(v) => {
                                updateItem(row.key, { productId: v });
                              }}
                              placeholder="Select product"
                              triggerClassName="h-8 text-sm rounded-none border-0 bg-transparent focus:ring-1 focus:ring-inset px-2 shadow-none"
                            />
                          </td>
                          <td className="p-0 align-top">
                            <Input
                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                              placeholder="Optional"
                              value={row.description}
                              onChange={(e) => updateItem(row.key, { description: e.target.value })}
                            />
                          </td>
                          <td className="p-0 align-top">
                            <Select
                              items={Object.fromEntries(SIZE_OPTIONS.map((opt) => [opt.value, opt.label]))}
                              value={row.sizeOption}
                              onValueChange={(v) => updateItem(row.key, { sizeOption: v ?? 'FIX' })}
                            >
                              <SelectTrigger className="h-8 text-sm rounded-none border-0 bg-transparent focus:ring-1 focus:ring-inset px-2 shadow-none">
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
                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                                type="number"
                                step="0.01"
                                value={row.width}
                                placeholder={row.sizeOption !== 'FIX' ? row.sizeOption : undefined}
                                onChange={(e) => updateItem(row.key, { width: e.target.value })}
                              />
                            )}
                          </td>
                          <td className="p-0 align-top">
                            {row.sizeOption === 'SELF' ? (
                              <div className="px-2 py-1.5 text-muted-foreground">—</div>
                            ) : (
                              <Input
                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                                type="number"
                                step="0.01"
                                value={row.length}
                                onChange={(e) => updateItem(row.key, { length: e.target.value })}
                              />
                            )}
                          </td>
                          <td className="p-0 align-top">
                            <Input
                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                              type="number"
                              step="0.01"
                              value={row.rate}
                              onChange={(e) => updateItem(row.key, { rate: e.target.value })}
                            />
                          </td>
                          <td className="p-0 align-top text-right font-mono">
                            {row.sizeOption === 'SELF' ? (
                              <Input
                                className="h-8 text-right font-mono text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"
                                type="number"
                                step="0.01"
                                placeholder="Sq ft"
                                value={row.sqft}
                                onChange={(e) => updateItem(row.key, { sqft: e.target.value })}
                              />
                            ) : (
                              <div className="px-2 py-1.5">{sqft !== null ? sqft.toLocaleString() : '—'}</div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top text-right font-mono">{amount !== null ? amount.toLocaleString() : '—'}</td>
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
                <span>Subtotal</span>
                <span className="font-mono text-foreground">{formatAmount(quotationSubtotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                <span>Total Amount</span>
                <span className="font-mono text-foreground">{formatAmount(quotationTotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                <span>Advance Received</span>
                <span className="font-mono text-foreground">{formatAmount(quotationAdvance)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 border-t border-border/70 pt-2 text-base font-semibold">
                <span>Remaining Amount</span>
                <span className="font-mono">{formatAmount(quotationRemaining)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : editingId ? 'Update quotation' : 'Create draft'}
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

      {/* QTN-02: add a customer without leaving the quotation form. */}
      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>Creates the customer and selects it on this quotation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateCustomer} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="newCustomerName">Name</Label>
              <Input id="newCustomerName" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newCustomerPhone">Phone</Label>
              <Input id="newCustomerPhone" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newCustomerAddress">Address</Label>
              <Input id="newCustomerAddress" value={newCustomerAddress} onChange={(e) => setNewCustomerAddress(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isCreatingCustomer}>
                {isCreatingCustomer ? 'Adding…' : 'Add customer'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setNewCustomerOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Quotations</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search number or customer"
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {quotationsQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotationsQuery.data?.data.length ? (
                    quotationsQuery.data.data.map((q) => (
                      <Fragment key={q.id}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                          <TableCell className="font-medium">{q.quotationNumber}</TableCell>
                          <TableCell>{q.customer.name}</TableCell>
                          <TableCell>{new Date(q.quotationDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-muted-foreground">{q.validUntil ? new Date(q.validUntil).toLocaleDateString() : '—'}</TableCell>
                          <TableCell className="text-right font-mono">{Number(q.totalAmount).toLocaleString()}</TableCell>
                          <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                            {q.status === 'DRAFT' && canEdit && (
                              <Button size="sm" variant="outline" onClick={() => startEdit(q)}>
                                Edit
                              </Button>
                            )}
                            {(q.status === 'DRAFT' || q.status === 'SENT') && canApprove && (
                              <Button size="sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(q.id)}>
                                Approve
                              </Button>
                            )}
                            {(q.status === 'DRAFT' || q.status === 'SENT' || q.status === 'APPROVED') && canApprove && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={rejectMutation.isPending}
                                onClick={() => {
                                  const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
                                  rejectMutation.mutate({ id: q.id, reason });
                                }}
                              >
                                Reject
                              </Button>
                            )}
                            {q.status === 'DRAFT' && canDelete && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={deleteMutation.isPending}
                                onClick={() => {
                                  if (window.confirm('Delete this draft quotation?')) deleteMutation.mutate(q.id);
                                }}
                              >
                                Delete
                              </Button>
                            )}
                            {q.status === 'APPROVED' && canConvert && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  const nextConvertingId = convertingId === q.id ? null : q.id;
                                  setConvertingId(nextConvertingId);
                                  setConvertLocationId(nextConvertingId ? defaultFactoryLocation?.id ?? '' : '');
                                }}
                              >
                                Convert to Invoice
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPdfInNewTab(`/quotations/${q.id}/pdf`).catch(() => toast.error('Could not open PDF'))}
                            >
                              PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                        {convertingId === q.id && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="flex items-end gap-3 py-2">
                                <div className="space-y-2 w-56">
                                  <Label>Receiving/selling location</Label>
                                  <Select
                                    items={Object.fromEntries((locationsQuery.data ?? []).map((location) => [location.id, location.name]))}
                                    value={effectiveConvertLocationId}
                                    onValueChange={(v) => setConvertLocationId(v ?? '')}
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
                                <Button
                                  size="sm"
                                  disabled={!effectiveConvertLocationId || convertMutation.isPending}
                                  onClick={() => convertMutation.mutate({ id: q.id, locationId: effectiveConvertLocationId })}
                                >
                                  Confirm conversion
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setConvertingId(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {expandedId === q.id && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="text-sm space-y-1 py-2">
                                {q.notes && <p className="text-muted-foreground whitespace-pre-line">{q.notes}</p>}
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Product</TableHead>
                                      <TableHead>Basis</TableHead>
                                      <TableHead className="text-right">Sq ft</TableHead>
                                      <TableHead className="text-right">Rate</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {q.items.map((item) => (
                                      <TableRow key={item.id}>
                                        <TableCell>
                                          {item.product.name}
                                          {item.inputParameters.description && (
                                            <div className="text-xs text-muted-foreground">{item.inputParameters.description}</div>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{dimensionSummary(item.inputParameters)}</TableCell>
                                        <TableCell className="text-right font-mono">{item.computedQuantity}</TableCell>
                                        <TableCell className="text-right font-mono">{item.computedRate}</TableCell>
                                        <TableCell className="text-right font-mono">{item.computedAmount}</TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow>
                                      <TableCell colSpan={4} className="text-right text-muted-foreground">Subtotal</TableCell>
                                      <TableCell className="text-right font-mono">{formatAmount(Number(q.subtotal))}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                      <TableCell colSpan={4} className="text-right text-muted-foreground">Advance Received</TableCell>
                                      <TableCell className="text-right font-mono">{formatAmount(Number(q.advanceReceived))}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                      <TableCell colSpan={4} className="text-right font-semibold">Remaining Amount</TableCell>
                                      <TableCell className="text-right font-mono font-semibold">
                                        {formatAmount(Math.max(0, Number(q.totalAmount) - Number(q.advanceReceived)))}
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
                        {search ? 'No quotations match this search.' : 'No quotations yet.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {quotationsQuery.data && quotationsQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {quotationsQuery.data.page} of {quotationsQuery.data.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= quotationsQuery.data.totalPages}
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
