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

interface Customer {
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
  customerPaymentId: string | null;
  salesInvoiceId: string | null;
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

export default function CustomerDetailPage() {
  return (
    <PermissionGate permission="customer.view">
      <CustomerDetailContent />
    </PermissionGate>
  );
}

function CustomerDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('customer.manage');
  const canViewLedger = hasPermission('customer_ledger.view');
  const canRecordPayment = hasPermission('customer_payment.create');
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const customerQuery = useQuery({ queryKey: ['customer', id], queryFn: () => apiClient.get<Customer>(`/customers/${id}`) });
  const banksQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get<{ banks: { id: string; name: string }[] }>('/accounts'),
    enabled: canRecordPayment,
  });
  const ledgerQuery = useQuery({
    queryKey: ['customer-ledger', id],
    queryFn: () => apiClient.get<Paginated<LedgerEntry>>(`/customers/${id}/ledger?pageSize=100`),
    enabled: canViewLedger,
  });

  async function onRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      toast.error('Enter a payment amount');
      return;
    }
    if (paymentMethod === 'BANK_TRANSFER' && !paymentAccountId) {
      toast.error('Select the bank account the payment landed in');
      return;
    }
    setIsRecordingPayment(true);
    try {
      await apiClient.post('/customer-payments', {
        customerId: id,
        amount: Number(paymentAmount),
        paymentMethod,
        accountId: paymentMethod === 'BANK_TRANSFER' ? paymentAccountId : undefined,
        referenceNo: paymentReference || undefined,
      });
      toast.success('Payment recorded');
      setPaymentAmount('');
      setPaymentAccountId('');
      setPaymentReference('');
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record payment');
    } finally {
      setIsRecordingPayment(false);
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function startEdit() {
    if (!customerQuery.data) return;
    reset({
      name: customerQuery.data.name,
      phone: customerQuery.data.phone ?? '',
      email: customerQuery.data.email ?? '',
      address: customerQuery.data.address ?? '',
    });
    setIsEditing(true);
  }

  const toggleActive = useMutation({
    mutationFn: () => apiClient.patch(`/customers/${id}`, { isActive: !customerQuery.data?.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer', id] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update customer'),
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/customers/${id}`, {
        name: values.name,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
      });
      toast.success('Customer updated');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update customer');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (customerQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!customerQuery.data) {
    return <p className="text-muted-foreground">Customer not found.</p>;
  }

  const customer = customerQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
          <p className="text-muted-foreground">Customer profile and ledger</p>
        </div>
        <Badge variant={customer.isActive ? 'success' : 'secondary'}>{customer.isActive ? 'Active' : 'Inactive'}</Badge>
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
                  {customer.isActive ? 'Deactivate' : 'Activate'}
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
                  {customer.phone ?? '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Email: </span>
                  {customer.email ?? '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Address: </span>
                  {customer.address ?? '—'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding balance</CardTitle>
            <CardDescription>Running balance across all invoices and payments</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold font-mono">{Number(customer.currentBalance).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {canRecordPayment && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record payment</CardTitle>
            <CardDescription>Reduces the customer&apos;s overall outstanding balance — not tied to a specific invoice.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onRecordPayment} className="grid gap-4 sm:grid-cols-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="paymentAmount">Amount</Label>
                <Input id="paymentAmount" type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
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
                <Label htmlFor="paymentReference">Reference</Label>
                <Input id="paymentReference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
              </div>
              <Button type="submit" disabled={isRecordingPayment}>
                {isRecordingPayment ? 'Recording…' : 'Record payment'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {canViewLedger && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Ledger</CardTitle>
              <CardDescription>All invoices, payments, returns, and settlements affecting this customer</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openPdfInNewTab(`/customers/${id}/ledger/pdf`).catch(() => toast.error('Could not open PDF'))}
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
                          {entry.salesInvoiceId ? (
                            <button
                              type="button"
                              className="text-primary underline underline-offset-2 hover:opacity-80"
                              onClick={() =>
                                openPdfInNewTab(`/sales-invoices/${entry.salesInvoiceId}/pdf`).catch(() => toast.error('Could not open invoice'))
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
                          {entry.customerPaymentId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openPdfInNewTab(`/customer-payments/${entry.customerPaymentId}/pdf`).catch(() =>
                                  toast.error('Could not open PDF'),
                                )
                              }
                            >
                              Receipt
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
