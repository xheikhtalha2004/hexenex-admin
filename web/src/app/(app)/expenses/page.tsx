'use client';

import { useState } from 'react';
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

interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { expenses: number };
}
interface Expense {
  id: string;
  expenseNumber: string;
  amount: string;
  paymentMethod: string;
  payee: string | null;
  remarks: string | null;
  expenseDate: string;
  category: ExpenseCategory;
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER'];

export default function ExpensesPage() {
  return (
    <PermissionGate permission="expense.view">
      <ExpensesContent />
    </PermissionGate>
  );
}

function ExpensesContent() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-muted-foreground">Salaries, utilities, transport, and other regular costs — factored into company-wide P&amp;L.</p>
      </div>
      <CategoriesSection />
      <ExpensesSection />
    </div>
  );
}

function CategoriesSection() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('expense.create');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => apiClient.get<ExpenseCategory[]>('/expense-categories'),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await apiClient.post('/expense-categories', { name });
      toast.success('Category created');
      setName('');
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create category');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canCreate && (
          <form onSubmit={onSubmit} className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="categoryName">New category name</Label>
              <Input id="categoryName" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add category'}
            </Button>
          </form>
        )}

        {categoriesQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {categoriesQuery.data?.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5">
                <span className="text-sm font-medium">{c.name}</span>
                <Badge variant="secondary">{c._count?.expenses ?? 0}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpensesSection() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('expense.create');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [accountId, setAccountId] = useState('');
  const [payee, setPayee] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => apiClient.get<ExpenseCategory[]>('/expense-categories'),
  });
  const expensesQuery = useQuery({
    queryKey: ['expenses', page],
    queryFn: () => apiClient.get<Paginated<Expense>>(`/expenses?page=${page}&pageSize=20`),
  });
  const banksQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get<{ banks: { id: string; name: string }[] }>('/accounts'),
    enabled: canCreate,
  });

  function resetForm() {
    setCategoryId('');
    setAmount('');
    setPaymentMethod('CASH');
    setAccountId('');
    setPayee('');
    setRemarks('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId || !amount || Number(amount) <= 0) {
      toast.error('Select a category and enter an amount');
      return;
    }
    if (paymentMethod === 'BANK_TRANSFER' && !accountId) {
      toast.error('Select the bank account this was paid from');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/expenses', {
        expenseCategoryId: categoryId,
        amount: Number(amount),
        paymentMethod,
        accountId: paymentMethod === 'BANK_TRANSFER' ? accountId : undefined,
        payee: payee || undefined,
        remarks: remarks || undefined,
      });
      toast.success('Expense recorded');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record expense');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Expense entries</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {canCreate && (
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3 items-end">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                items={Object.fromEntries((categoriesQuery.data ?? []).map((c) => [c.id, c.name]))}
                value={categoryId}
                onValueChange={(v) => setCategoryId(v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesQuery.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
                  value={accountId}
                  onValueChange={(v) => setAccountId(v ?? '')}
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
              <Label htmlFor="payee">Payee</Label>
              <Input id="payee" value={payee} onChange={(e) => setPayee(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Input id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Recording…' : 'Record expense'}
              </Button>
            </div>
          </form>
        )}

        {expensesQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensesQuery.data?.data.length ? (
                  expensesQuery.data.data.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.expenseNumber}</TableCell>
                      <TableCell>{e.category.name}</TableCell>
                      <TableCell>{e.payee ?? '—'}</TableCell>
                      <TableCell>{new Date(e.expenseDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right font-mono">{Number(e.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{e.remarks ?? '—'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No expenses recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {expensesQuery.data && expensesQuery.data.totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {expensesQuery.data.page} of {expensesQuery.data.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= expensesQuery.data.totalPages} onClick={() => setPage((p) => p + 1)}>
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
