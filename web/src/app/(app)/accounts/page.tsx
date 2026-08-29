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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface Account {
  id: string;
  name: string;
  type: 'CASH' | 'BANK' | 'CHEQUE_CLEARING';
  bankName: string | null;
  accountNumber: string | null;
  currentBalance: string;
}
interface AccountsSummary {
  cash: Account | null;
  chequeClearing: Account | null;
  banks: Account[];
}
interface AccountTransaction {
  id: string;
  amount: string;
  balanceAfter: string;
  description: string;
  entryDate: string;
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AccountsPage() {
  return (
    <PermissionGate permission="accounts.view">
      <AccountsContent />
    </PermissionGate>
  );
}

function AccountsContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('accounts.manage');
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showAddCash, setShowAddCash] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashRemarks, setCashRemarks] = useState('');
  const [isAddingCash, setIsAddingCash] = useState(false);

  const [showAddBank, setShowAddBank] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankOpeningBalance, setBankOpeningBalance] = useState('0');
  const [isAddingBank, setIsAddingBank] = useState(false);

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: () => apiClient.get<AccountsSummary>('/accounts') });
  const historyQuery = useQuery({
    queryKey: ['account-transactions', selectedId],
    queryFn: () => apiClient.get<Paginated<AccountTransaction>>(`/accounts/${selectedId}/transactions?pageSize=50`),
    enabled: !!selectedId,
  });

  const addCashMutation = useMutation({
    mutationFn: () => apiClient.post('/accounts/cash/add', { amount: Number(cashAmount), remarks: cashRemarks || undefined }),
    onSuccess: () => {
      toast.success('Cash added');
      setShowAddCash(false);
      setCashAmount('');
      setCashRemarks('');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add cash'),
    onSettled: () => setIsAddingCash(false),
  });

  const addBankMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/accounts', {
        name: bankName,
        bankName: bankBranch || undefined,
        accountNumber: bankAccountNumber || undefined,
        openingBalance: Number(bankOpeningBalance) || 0,
      }),
    onSuccess: () => {
      toast.success('Bank account added');
      setShowAddBank(false);
      setBankName('');
      setBankBranch('');
      setBankAccountNumber('');
      setBankOpeningBalance('0');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add bank account'),
    onSettled: () => setIsAddingBank(false),
  });

  function onAddCash(e: React.FormEvent) {
    e.preventDefault();
    if (!cashAmount || Number(cashAmount) <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setIsAddingCash(true);
    addCashMutation.mutate();
  }

  function onAddBank(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim()) {
      toast.error('Enter a name for this bank account');
      return;
    }
    setIsAddingBank(true);
    addBankMutation.mutate();
  }

  const selectedAccount =
    accountsQuery.data &&
    [accountsQuery.data.cash, accountsQuery.data.chequeClearing, ...accountsQuery.data.banks].find((a) => a?.id === selectedId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bank &amp; Cash</h1>
        <p className="text-muted-foreground">
          Cash on hand, each bank account, and cheques awaiting clearing. Every customer payment, supplier payment, advance,
          and expense posts here automatically based on the payment method selected.
        </p>
      </div>

      {accountsQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            className="text-left"
            onClick={() => accountsQuery.data?.cash && setSelectedId(accountsQuery.data.cash.id)}
          >
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardDescription>Cash</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {Number(accountsQuery.data?.cash?.currentBalance ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          </button>

          {accountsQuery.data?.banks.map((b) => (
            <button key={b.id} type="button" className="text-left" onClick={() => setSelectedId(b.id)}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <CardDescription>{b.name}</CardDescription>
                  <CardTitle className="text-2xl font-mono">{Number(b.currentBalance).toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
            </button>
          ))}

          <button
            type="button"
            className="text-left"
            onClick={() => accountsQuery.data?.chequeClearing && setSelectedId(accountsQuery.data.chequeClearing.id)}
          >
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardDescription>Cheques (Clearing)</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {Number(accountsQuery.data?.chequeClearing?.currentBalance ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          </button>
        </div>
      )}

      {canManage && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddCash((s) => !s)}>
            Add Cash
          </Button>
          <Button variant="outline" onClick={() => setShowAddBank((s) => !s)}>
            Add Bank Account
          </Button>
        </div>
      )}

      {canManage && showAddCash && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add cash</CardTitle>
            <CardDescription>Records a manual top-up to the cash account, e.g. the owner adding cash to the till.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAddCash} className="grid gap-4 sm:grid-cols-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="cashAmount">Amount</Label>
                <Input id="cashAmount" type="number" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cashRemarks">Remarks</Label>
                <Input id="cashRemarks" value={cashRemarks} onChange={(e) => setCashRemarks(e.target.value)} />
              </div>
              <Button type="submit" disabled={isAddingCash}>
                {isAddingCash ? 'Adding…' : 'Add cash'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {canManage && showAddBank && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add bank account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAddBank} className="grid gap-4 sm:grid-cols-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="bankAccName">Account name</Label>
                <Input id="bankAccName" placeholder="e.g. HBL - Main" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccBank">Bank name</Label>
                <Input id="bankAccBank" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccNumber">Account number</Label>
                <Input id="bankAccNumber" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankOpeningBalance">Opening balance</Label>
                <Input
                  id="bankOpeningBalance"
                  type="number"
                  step="0.01"
                  value={bankOpeningBalance}
                  onChange={(e) => setBankOpeningBalance(e.target.value)}
                />
              </div>
              <div className="sm:col-span-4">
                <Button type="submit" disabled={isAddingBank}>
                  {isAddingBank ? 'Adding…' : 'Add bank account'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedAccount?.name ?? 'Account'} — transaction history</CardTitle>
          </CardHeader>
          <CardContent>
            {historyQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyQuery.data?.data.length ? (
                    historyQuery.data.data.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{new Date(t.entryDate).toLocaleString()}</TableCell>
                        <TableCell>{t.description}</TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(t.amount) >= 0 ? '+' : ''}
                          {Number(t.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">{Number(t.balanceAfter).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No transactions yet.
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
