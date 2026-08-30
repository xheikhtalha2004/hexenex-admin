'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

interface SalesInvoiceItem {
  id: string;
  quantity: string;
  rate: string;
  product: { id: string; name: string };
}
interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string;
  customer: { name: string };
  location: { name: string };
  items: SalesInvoiceItem[];
}
interface SalesReturnItem {
  id: string;
  description: string | null;
  sizeOption: string | null;
  pieces: string | null;
  width: string | null;
  length: string | null;
  usableWidth: string | null;
  usableLength: string | null;
  quantity: string;
  rate: string;
  amount: string;
  product: { name: string };
  salesInvoiceItemId: string;
}
interface SalesReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  totalAmount: string;
  reason: string | null;
  customer: { name: string };
  salesInvoice: { invoiceNumber: string };
  items: SalesReturnItem[];
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

/** Same sizing options as the quotation formula — a return is recorded the same way the item
 * was sold: Sq ft = pieces × width × length ÷ 144, or entered directly in Self mode. */
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

interface ReturnLineDraft {
  included: boolean;
  description: string;
  sizeOption: string;
  pieces: string;
  width: string;
  length: string;
  trimmed: boolean;
  usableWidth: string;
  usableLength: string;
  sqftDirect: string;
}

function emptyLine(): ReturnLineDraft {
  return {
    included: false,
    description: '',
    sizeOption: 'FIX',
    pieces: '',
    width: '',
    length: '',
    trimmed: false,
    usableWidth: '',
    usableLength: '',
    sqftDirect: '',
  };
}

/** Mirrors the quotation engine's formula client-side for a live preview; the server remains
 * authoritative for the value actually saved. Uses the usable size when the operator has
 * recorded a trim/damage, otherwise the as-returned size — either way this single figure is
 * what both the credited amount and the restocked square feet are based on. */
function previewSqft(line: ReturnLineDraft): number | null {
  if (line.sizeOption === 'SELF') {
    const sqft = Number(line.sqftDirect);
    return Number.isFinite(sqft) && sqft > 0 ? sqft : null;
  }
  const pieces = Number(line.pieces);
  const length = Number(line.length);
  if (!Number.isFinite(pieces) || pieces <= 0 || !Number.isFinite(length) || length <= 0) return null;
  const width = line.sizeOption === 'FIX' ? Number(line.width) : Number(line.sizeOption);
  if (!Number.isFinite(width) || width <= 0) return null;

  const effectiveWidth = line.trimmed && line.usableWidth ? Number(line.usableWidth) : width;
  const effectiveLength = line.trimmed && line.usableLength ? Number(line.usableLength) : length;
  if (!Number.isFinite(effectiveWidth) || effectiveWidth <= 0 || !Number.isFinite(effectiveLength) || effectiveLength <= 0) return null;

  return Math.round(((pieces * effectiveWidth * effectiveLength) / 144) * 100) / 100;
}

export default function SalesReturnsPage() {
  return (
    <PermissionGate permission="sales_return.view">
      <SalesReturnsContent />
    </PermissionGate>
  );
}

function SalesReturnsContent() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('sales_return.create');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Record<string, ReturnLineDraft>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const invoicesQuery = useQuery({
    queryKey: ['sales-invoices-finalized-picker'],
    queryFn: () => apiClient.get<Paginated<SalesInvoice>>('/sales-invoices?status=FINALIZED&pageSize=100'),
  });
  const returnsQuery = useQuery({
    queryKey: ['sales-returns', page],
    queryFn: () => apiClient.get<Paginated<SalesReturn>>(`/sales-returns?page=${page}&pageSize=20`),
  });
  // Existing returns against the selected invoice, so "remaining returnable" can be enforced
  // in the UI too, not just discovered from a server error after submitting.
  const existingReturnsQuery = useQuery({
    queryKey: ['sales-returns-for-invoice', selectedInvoiceId],
    queryFn: () => apiClient.get<Paginated<SalesReturn>>(`/sales-returns?salesInvoiceId=${selectedInvoiceId}&pageSize=200`),
    enabled: !!selectedInvoiceId,
  });

  const selectedInvoice = invoicesQuery.data?.data.find((i) => i.id === selectedInvoiceId);

  const alreadyReturnedByItem = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const ret of existingReturnsQuery.data?.data ?? []) {
      for (const item of ret.items) {
        totals[item.salesInvoiceItemId] = (totals[item.salesInvoiceItemId] ?? 0) + Number(item.quantity);
      }
    }
    return totals;
  }, [existingReturnsQuery.data]);

  function lineFor(itemId: string): ReturnLineDraft {
    return lines[itemId] ?? emptyLine();
  }
  function updateLine(itemId: string, patch: Partial<ReturnLineDraft>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...lineFor(itemId), ...patch } }));
  }

  function resetForm() {
    setSelectedInvoiceId('');
    setReason('');
    setLines({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoice) {
      toast.error('Select a finalized invoice');
      return;
    }
    const items = Object.entries(lines)
      .filter(([, line]) => line.included)
      .map(([salesInvoiceItemId, line]) => {
        const quantity = previewSqft(line);
        return { salesInvoiceItemId, line, quantity };
      });

    if (items.length === 0) {
      toast.error('Include at least one item and enter its returned size');
      return;
    }
    for (const { line, quantity } of items) {
      if (quantity === null) {
        toast.error('Enter complete dimensions (or sq ft) for every included item');
        return;
      }
      void line;
    }
    for (const { salesInvoiceItemId, quantity } of items) {
      const invoiceItem = selectedInvoice.items.find((i) => i.id === salesInvoiceItemId);
      const remaining = Number(invoiceItem?.quantity ?? 0) - (alreadyReturnedByItem[salesInvoiceItemId] ?? 0);
      if ((quantity ?? 0) > remaining + 0.001) {
        toast.error(`${invoiceItem?.product.name}: only ${remaining.toFixed(2)} sq ft remain returnable on this invoice line`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/sales-returns', {
        salesInvoiceId: selectedInvoice.id,
        reason: reason || undefined,
        items: items.map(({ salesInvoiceItemId, line, quantity }) => ({
          salesInvoiceItemId,
          description: line.description || undefined,
          sizeOption: line.sizeOption,
          pieces: line.sizeOption === 'SELF' ? undefined : Number(line.pieces),
          width: line.sizeOption === 'SELF'
            ? undefined
            : line.sizeOption === 'FIX'
              ? Number(line.width)
              : Number(line.sizeOption),
          length: line.sizeOption === 'SELF' ? undefined : Number(line.length),
          usableWidth: line.trimmed && line.usableWidth ? Number(line.usableWidth) : undefined,
          usableLength: line.trimmed && line.usableLength ? Number(line.usableLength) : undefined,
          quantity,
        })),
      });
      toast.success('Sales return recorded — stock and customer ledger updated');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record return');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales Returns</h1>
        <p className="text-muted-foreground">
          Returns are always credited and restocked by square feet — never by piece count — using the usable size after any
          trimming or damage. Stock and the customer&apos;s balance update against a finalized invoice only.
        </p>
      </div>

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New return</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Invoice</Label>
                  <SearchableSelect
                    items={(invoicesQuery.data?.data ?? []).map((inv) => ({ value: inv.id, label: `${inv.invoiceNumber} — ${inv.customer.name}` }))}
                    value={selectedInvoiceId}
                    onValueChange={(v) => {
                      setSelectedInvoiceId(v ?? '');
                      setLines({});
                    }}
                    placeholder="Select a finalized invoice"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong size cut" />
                </div>
              </div>

              {selectedInvoice && (
                <div className="rounded-lg border border-border/70 p-3 text-sm grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Invoice No.</div>
                    <div className="font-medium">{selectedInvoice.invoiceNumber}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Customer</div>
                    <div className="font-medium">{selectedInvoice.customer.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Location</div>
                    <div className="font-medium">{selectedInvoice.location.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Date / Total</div>
                    <div className="font-medium">
                      {new Date(selectedInvoice.invoiceDate).toLocaleDateString()} / {Number(selectedInvoice.totalAmount).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {selectedInvoice && (
                <div className="space-y-3">
                  <Label>Items on this invoice</Label>
                  {selectedInvoice.items.map((item) => {
                    const line = lineFor(item.id);
                    const remaining = Number(item.quantity) - (alreadyReturnedByItem[item.id] ?? 0);
                    const sqft = previewSqft(line);
                    const amount = sqft !== null ? sqft * Number(item.rate) : null;
                    const overLimit = sqft !== null && sqft > remaining + 0.001;

                    return (
                      <div key={item.id} className="space-y-2 rounded-lg border border-border/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={line.included}
                              onChange={(e) => updateLine(item.id, { included: e.target.checked })}
                            />
                            {item.product.name}
                          </label>
                          <div className="text-xs text-muted-foreground">
                            Invoiced {item.quantity} sq ft × {item.rate} — <span className={remaining <= 0 ? 'text-destructive' : ''}>{remaining.toFixed(2)} sq ft remain returnable</span>
                          </div>
                        </div>

                        {line.included && (
                          <div className="space-y-2 pl-6">
                            <Input
                              placeholder="Description (optional)"
                              value={line.description}
                              onChange={(e) => updateLine(item.id, { description: e.target.value })}
                            />
                            <div className="grid grid-cols-12 gap-2 items-end">
                              <div className="col-span-3">
                                <Label className="text-xs text-muted-foreground">Size</Label>
                                <Select
                                  items={Object.fromEntries(SIZE_OPTIONS.map((opt) => [opt.value, opt.label]))}
                                  value={line.sizeOption}
                                  onValueChange={(v) => updateLine(item.id, { sizeOption: v ?? 'FIX' })}
                                >
                                  <SelectTrigger>
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
                              </div>

                              {line.sizeOption === 'SELF' ? (
                                <div className="col-span-3">
                                  <Label className="text-xs text-muted-foreground">Sq ft</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={line.sqftDirect}
                                    onChange={(e) => updateLine(item.id, { sqftDirect: e.target.value })}
                                  />
                                </div>
                              ) : (
                                <>
                                  <div className="col-span-2">
                                    <Label className="text-xs text-muted-foreground">Quantity</Label>
                                    <Input type="number" step="1" value={line.pieces} onChange={(e) => updateLine(item.id, { pieces: e.target.value })} />
                                  </div>
                                  <div className="col-span-2">
                                    <Label className="text-xs text-muted-foreground">Width</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={line.sizeOption === 'FIX' ? line.width : line.sizeOption}
                                      disabled={line.sizeOption !== 'FIX'}
                                      onChange={(e) => updateLine(item.id, { width: e.target.value })}
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <Label className="text-xs text-muted-foreground">Length</Label>
                                    <Input type="number" step="0.01" value={line.length} onChange={(e) => updateLine(item.id, { length: e.target.value })} />
                                  </div>
                                </>
                              )}

                              <div className="col-span-3 text-sm text-muted-foreground">
                                {sqft !== null ? (
                                  <span>
                                    <span className={`font-mono font-medium ${overLimit ? 'text-destructive' : 'text-foreground'}`}>{sqft.toLocaleString()}</span>{' '}
                                    sq ft{amount !== null && <> = <span className="font-mono font-medium text-foreground">{amount.toLocaleString()}</span></>}
                                  </span>
                                ) : (
                                  'Enter dimensions to preview'
                                )}
                              </div>
                            </div>

                            {line.sizeOption !== 'SELF' && (
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input type="checkbox" checked={line.trimmed} onChange={(e) => updateLine(item.id, { trimmed: e.target.checked })} />
                                Usable size is smaller than returned (damage / edge trimming)
                              </label>
                            )}
                            {line.trimmed && line.sizeOption !== 'SELF' && (
                              <div className="grid grid-cols-12 gap-2 pl-5">
                                <div className="col-span-3">
                                  <Label className="text-xs text-muted-foreground">Usable width</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={line.usableWidth}
                                    onChange={(e) => updateLine(item.id, { usableWidth: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-3">
                                  <Label className="text-xs text-muted-foreground">Usable length</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={line.usableLength}
                                    onChange={(e) => updateLine(item.id, { usableLength: e.target.value })}
                                  />
                                </div>
                              </div>
                            )}
                            {overLimit && (
                              <p className="text-xs text-destructive pl-1">Exceeds the {remaining.toFixed(2)} sq ft still returnable on this line.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button type="submit" disabled={isSubmitting || !selectedInvoice}>
                {isSubmitting ? 'Recording…' : 'Record return'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Return history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {returnsQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Against invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnsQuery.data?.data.length ? (
                    returnsQuery.data.data.map((r) => (
                      <Fragment key={r.id}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                          <TableCell className="font-medium">{r.returnNumber}</TableCell>
                          <TableCell>{r.salesInvoice.invoiceNumber}</TableCell>
                          <TableCell>{r.customer.name}</TableCell>
                          <TableCell>{new Date(r.returnDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-mono">{Number(r.totalAmount).toLocaleString()}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPdfInNewTab(`/sales-returns/${r.id}/pdf`).catch(() => toast.error('Could not open PDF'))}
                            >
                              PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expandedId === r.id && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="text-sm space-y-1 py-2">
                                {r.reason && <p className="text-muted-foreground">Reason: {r.reason}</p>}
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead>Product</TableHead>
                                      <TableHead className="text-right">Width</TableHead>
                                      <TableHead className="text-right">Length</TableHead>
                                      <TableHead className="text-right">Usable width</TableHead>
                                      <TableHead className="text-right">Usable length</TableHead>
                                      <TableHead className="text-right">Sq ft</TableHead>
                                      <TableHead className="text-right">Rate</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {r.items.map((item) => {
                                      const isSelf = item.sizeOption === 'SELF';
                                      const width = isSelf
                                        ? '—'
                                        : item.width ?? (item.sizeOption && item.sizeOption !== 'FIX' ? item.sizeOption : '—');
                                      const length = isSelf ? '—' : item.length ?? '—';
                                      return (
                                        <TableRow key={item.id}>
                                          <TableCell className="text-right font-mono">{isSelf ? '—' : item.pieces ?? '—'}</TableCell>
                                          <TableCell>
                                            {item.product.name}
                                            {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">{width}</TableCell>
                                          <TableCell className="text-right font-mono">{length}</TableCell>
                                          <TableCell className="text-right font-mono">{isSelf ? '—' : item.usableWidth ?? width}</TableCell>
                                          <TableCell className="text-right font-mono">{isSelf ? '—' : item.usableLength ?? length}</TableCell>
                                          <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                          <TableCell className="text-right font-mono">{item.rate}</TableCell>
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
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No returns yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {returnsQuery.data && returnsQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {returnsQuery.data.page} of {returnsQuery.data.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= returnsQuery.data.totalPages} onClick={() => setPage((p) => p + 1)}>
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
