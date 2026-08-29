'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient, ApiError, openPdfInNewTab } from '@/lib/api-client';
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

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER'];

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  currentBalance: string;
  isActive: boolean;
}

interface LedgerEntry {
  id: string;
  entryType: string;
  amount: string;
  balanceAfter: string;
  counterpartyLabel: string | null;
  description: string | null;
  entryDate: string;
  supplierPaymentId: string | null;
  purchaseInvoiceId: string | null;
}

interface Paginated<T> {
  data: T[];
  total: number;
}

const schema = z.object({
  name: z.string().min(1, 'Required'),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function SupplierDetailPage() {
  return (
    <PermissionGate permission="supplier.view">
      <SupplierDetailContent />
    </PermissionGate>
  );
}

function SupplierDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('supplier.manage');
  const canViewLedger = hasPermission('supplier_ledger.view');
  const canRecordPayment = hasPermission('supplier_payment.create');
  const canRecordAdvance = hasPermission('supplier_advance.create');
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState('CASH');
  const [advanceAccountId, setAdvanceAccountId] = useState('');
  const [advanceRemarks, setAdvanceRemarks] = useState('');
  const [isRecordingAdvance, setIsRecordingAdvance] = useState(false);

  const supplierQuery = useQuery({ queryKey: ['supplier', id], queryFn: () => apiClient.get<Supplier>(`/suppliers/${id}`) });
  const banksQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get<{ banks: { id: string; name: string }[] }>('/accounts'),
    enabled: canRecordPayment || canRecordAdvance,
  });
  const ledgerQuery = useQuery({
    queryKey: ['supplier-ledger', id],
    queryFn: () => apiClient.get<Paginated<LedgerEntry>>(`/suppliers/${id}/ledger?pageSize=100`),
    enabled: canViewLedger,
  });

  async function onRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      toast.error('Enter a payment amount');
      return;
    }
    if (paymentMethod === 'BANK_TRANSFER' && !paymentAccountId) {
      toast.error('Select the bank account the payment was made from');
      return;
    }
    setIsRecordingPayment(true);
    try {
      await apiClient.post('/supplier-payments', {
        supplierId: id,
        amount: Number(paymentAmount),
        paymentMethod,
        accountId: paymentMethod === 'BANK_TRANSFER' ? paymentAccountId : undefined,
        referenceNo: paymentReference || undefined,
      });
      toast.success('Payment recorded');
      setPaymentAmount('');
      setPaymentAccountId('');
      setPaymentReference('');
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['supplier-ledger', id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record payment');
    } finally {
      setIsRecordingPayment(false);
    }
  }

  async function onRecordAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!advanceAmount || Number(advanceAmount) <= 0) {
      toast.error('Enter an advance amount');
      return;
    }
    if (advanceMethod === 'BANK_TRANSFER' && !advanceAccountId) {
      toast.error('Select the bank account the advance was made from');
      return;
    }
    setIsRecordingAdvance(true);
    try {
      await apiClient.post('/supplier-advances', {
        supplierId: id,
        amount: Number(advanceAmount),
        paymentMethod: advanceMethod,
        accountId: advanceMethod === 'BANK_TRANSFER' ? advanceAccountId : undefined,
        remarks: advanceRemarks || undefined,
      });
      toast.success('Advance recorded');
      setAdvanceAmount('');
      setAdvanceAccountId('');
      setAdvanceRemarks('');
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['supplier-ledger', id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record advance');
    } finally {
      setIsRecordingAdvance(false);
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function startEdit() {
    if (!supplierQuery.data) return;
    reset({
      name: supplierQuery.data.name,
      phone: supplierQuery.data.phone ?? '',
      email: supplierQuery.data.email ?? '',
      address: supplierQuery.data.address ?? '',
    });
    setIsEditing(true);
  }

  const toggleActive = useMutation({
    mutationFn: () => apiClient.patch(`/suppliers/${id}`, { isActive: !supplierQuery.data?.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplier', id] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update supplier'),
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/suppliers/${id}`, {
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
      });
      toast.success('Supplier updated');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update supplier');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (supplierQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!supplierQuery.data) {
    return <p className="text-muted-foreground">Supplier not found.</p>;
  }

  const supplier = supplierQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{supplier.name}</h1>
          <p className="text-muted-foreground">Supplier profile and ledger</p>
        </div>
        <Badge variant={supplier.isActive ? 'success' : 'secondary'}>{supplier.isActive ? 'Active' : 'Inactive'}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Profile</CardTitle>
            {canManage && !isEditing && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={startEdit}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate()}>
                  {supplier.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" {...register('name')} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" {...register('phone')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...register('email')} />
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" {...register('address')} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : 'Save'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Phone: </span>
                  {supplier.phone ?? '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Email: </span>
                  {supplier.email ?? '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Address: </span>
                  {supplier.address ?? '—'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding payable</CardTitle>
            <CardDescription>Running balance across all purchases, payments, and advances</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold font-mono">{Number(supplier.currentBalance).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {(canRecordPayment || canRecordAdvance) && (
        <div className="grid gap-6 md:grid-cols-2">
          {canRecordPayment && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Record payment</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onRecordPayment} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplierPaymentAmount">Amount</Label>
                    <Input
                      id="supplierPaymentAmount"
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select
                      items={Object.fromEntries(PAYMENT_METHODS.map((m) => [m, m.replace('_', ' ')]))}
                      value={paymentMethod}
                      onValueChange={(v) => setPaymentMethod(v ?? 'CASH')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m.replace('_', ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {paymentMethod === 'BANK_TRANSFER' && (
                    <div className="space-y-2">
                      <Label>Bank account</Label>
                      <Select
                        items={Object.fromEntries((banksQuery.data?.banks ?? []).map((b) => [b.id, b.name]))}
                        value={paymentAccountId}
                        onValueChange={(v) => setPaymentAccountId(v ?? '')}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          {banksQuery.data?.banks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="supplierPaymentReference">Reference</Label>
                    <Input id="supplierPaymentReference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={isRecordingPayment}>
                    {isRecordingPayment ? 'Recording…' : 'Record payment'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {canRecordAdvance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Record advance</CardTitle>
                <CardDescription>Paid before goods are received — still reduces the running payable.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onRecordAdvance} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="advanceAmount">Amount</Label>
                    <Input id="advanceAmount" type="number" step="0.01" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select
                      items={Object.fromEntries(PAYMENT_METHODS.map((m) => [m, m.replace('_', ' ')]))}
                      value={advanceMethod}
                      onValueChange={(v) => setAdvanceMethod(v ?? 'CASH')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m.replace('_', ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {advanceMethod === 'BANK_TRANSFER' && (
                    <div className="space-y-2">
                      <Label>Bank account</Label>
                      <Select
                        items={Object.fromEntries((banksQuery.data?.banks ?? []).map((b) => [b.id, b.name]))}
                        value={advanceAccountId}
                        onValueChange={(v) => setAdvanceAccountId(v ?? '')}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          {banksQuery.data?.banks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="advanceRemarks">Remarks</Label>
                    <Input id="advanceRemarks" value={advanceRemarks} onChange={(e) => setAdvanceRemarks(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={isRecordingAdvance}>
                    {isRecordingAdvance ? 'Recording…' : 'Record advance'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {canViewLedger && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Ledger</CardTitle>
              <CardDescription>All purchases, payments, advances, and settlements affecting this supplier</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openPdfInNewTab(`/suppliers/${id}/ledger/pdf`).catch(() => toast.error('Could not open PDF'))}
            >
              Statement PDF
            </Button>
          </CardHeader>
          <CardContent>
            {ledgerQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerQuery.data?.data.length ? (
                    ledgerQuery.data.data.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.entryDate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.entryType.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell>
                          {entry.purchaseInvoiceId ? (
                            <button
                              type="button"
                              className="text-primary underline underline-offset-2 hover:opacity-80"
                              onClick={() =>
                                openPdfInNewTab(`/purchases/${entry.purchaseInvoiceId}/pdf`).catch(() => toast.error('Could not open invoice'))
                              }
                            >
                              {entry.description ?? '—'}
                            </button>
                          ) : (
                            entry.description ?? '—'
                          )}
                          {entry.counterpartyLabel ? <strong> {entry.counterpartyLabel}</strong> : ''}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(entry.amount) >= 0 ? '+' : ''}
                          {Number(entry.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">{Number(entry.balanceAfter).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {entry.supplierPaymentId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openPdfInNewTab(`/supplier-payments/${entry.supplierPaymentId}/pdf`).catch(() =>
                                  toast.error('Could not open PDF'),
                                )
                              }
                            >
                              Voucher
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No ledger activity yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
