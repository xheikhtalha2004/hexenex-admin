'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient, ApiError, openPdfInNewTab } from '@/lib/api-client';
import { PermissionGate } from '@/components/permission-gate';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';

interface Customer {
  id: string;
  name: string;
}
interface Supplier {
  id: string;
  name: string;
}
interface Settlement {
  id: string;
  settlementNumber: string;
  amount: string;
  remarks: string | null;
  settlementDate: string;
  customer: Customer;
  supplier: Supplier;
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `settle-${Date.now()}-${Math.random()}`;
}

export default function SettlementsPage() {
  return (
    <PermissionGate permission="settlement.view">
      <SettlementsContent />
    </PermissionGate>
  );
}

function SettlementsContent() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('settlement.create');
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const customersQuery = useQuery({ queryKey: ['customers-picker'], queryFn: () => apiClient.get<Customer[]>('/customers/picker') });
  const suppliersQuery = useQuery({ queryKey: ['suppliers-picker'], queryFn: () => apiClient.get<Supplier[]>('/suppliers/picker') });
  const settlementsQuery = useQuery({
    queryKey: ['settlements', page],
    queryFn: () => apiClient.get<Paginated<Settlement>>(`/settlements?page=${page}&pageSize=20`),
  });

  function resetForm() {
    setCustomerId('');
    setSupplierId('');
    setAmount('');
    setRemarks('');
    setIdempotencyKey(newIdempotencyKey());
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !supplierId || !amount || Number(amount) <= 0) {
      toast.error('Select a customer, a supplier, and enter an amount');
      return;
    }
    setConfirmOpen(true);
  }

  async function onConfirmSettlement() {
    setIsSubmitting(true);
    try {
      await apiClient.post('/settlements', {
        customerId,
        supplierId,
        amount: Number(amount),
        remarks: remarks || undefined,
        idempotencyKey,
      });
      const customerName = customersQuery.data?.find((c) => c.id === customerId)?.name ?? 'Customer';
      const supplierName = suppliersQuery.data?.find((s) => s.id === supplierId)?.name ?? 'Supplier';
      toast.success(`${customerName} paid ${supplierName} on the factory's behalf — both ledgers updated`);
      resetForm();
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record settlement');
    } finally {
      setIsSubmitting(false);
    }
  }

  const confirmCustomerName = customersQuery.data?.find((c) => c.id === customerId)?.name;
  const confirmSupplierName = suppliersQuery.data?.find((s) => s.id === supplierId)?.name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customer-to-Supplier Settlements</h1>
        <p className="text-muted-foreground">
          When a customer pays a supplier directly on the factory&apos;s behalf, record it once here — both the customer&apos;s
          receivable and the supplier&apos;s payable update atomically, so the two ledgers can never fall out of sync.
        </p>
      </div>

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New settlement</CardTitle>
            <CardDescription>Resubmitting the same form after a network hiccup is safe — it won&apos;t double-process.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-4 items-end">
              <div className="space-y-2">
                <Label>Customer (owes the factory)</Label>
                <Select
                  items={Object.fromEntries((customersQuery.data ?? []).map((c) => [c.id, c.name]))}
                  value={customerId}
                  onValueChange={(v) => setCustomerId(v ?? '')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customersQuery.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Supplier (factory owes)</Label>
                <Select
                  items={Object.fromEntries((suppliersQuery.data ?? []).map((s) => [s.id, s.name]))}
                  value={supplierId}
                  onValueChange={(v) => setSupplierId(v ?? '')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliersQuery.data?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks / reference</Label>
                <Input id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <div className="sm:col-span-4">
                <Button type="submit" disabled={isSubmitting}>
                  Record settlement
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !open && setConfirmOpen(false)}
        title="Record this settlement?"
        description={
          <>
            <strong>{confirmCustomerName ?? 'This customer'}</strong> paid <strong>{confirmSupplierName ?? 'this supplier'}</strong>{' '}
            <strong>{Number(amount || 0).toLocaleString()}</strong> directly on the factory&apos;s behalf. This updates both the
            customer&apos;s receivable and the supplier&apos;s payable at once and cannot be edited afterward.
          </>
        }
        confirmLabel="Record settlement"
        isConfirming={isSubmitting}
        onConfirm={onConfirmSettlement}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settlementsQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlementsQuery.data?.data.length ? (
                    settlementsQuery.data.data.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.settlementNumber}</TableCell>
                        <TableCell>
                          Paid by <strong>{s.customer.name}</strong>
                        </TableCell>
                        <TableCell>
                          Paid to <strong>{s.supplier.name}</strong>
                        </TableCell>
                        <TableCell>{new Date(s.settlementDate).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right font-mono">{Number(s.amount).toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">{s.remarks ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPdfInNewTab(`/settlements/${s.id}/pdf`).catch(() => toast.error('Could not open receipt'))}
                          >
                            View Receipt
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No settlements recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {settlementsQuery.data && settlementsQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {settlementsQuery.data.page} of {settlementsQuery.data.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= settlementsQuery.data.totalPages}
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
