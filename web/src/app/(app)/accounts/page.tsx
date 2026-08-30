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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: () => apiClient.get<AccountsSummary>('/accounts') });
  const historyQuery = useQuery({
    queryKey: ['account-transactions', selectedId],
    queryFn: () => apiClient.get<Paginated<AccountTransaction>>(`/accounts/${selectedId}/transactions?pageSize=50`),
    enabled: !!selectedId,
  });

  const transferableAccounts: Account[] = [...(accountsQuery.data?.cash ? [accountsQuery.data.cash] : []), ...(accountsQuery.data?.banks ?? [])];
  const transferSource = transferableAccounts.find((account) => account.id === transferSourceId);
  const transferDestination = transferableAccounts.find((account) => account.id === transferDestinationId);
  const transferDestinationOptions = transferSource ? (transferSource.type === 'CASH' ? (accountsQuery.data?.banks ?? []) : accountsQuery.data?.cash ? [accountsQuery.data.cash] : []) : [];

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

  const transferMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/accounts/transfer', {
        sourceAccountId: transferSourceId,
        destinationAccountId: transferDestinationId,
        amount: Number(transferAmount),
        remarks: transferRemarks.trim() || undefined,
      }),
    onSuccess: () => {
      const sourceName = transferableAccounts.find((account) => account.id === transferSourceId)?.name;
      const destinationName = transferableAccounts.find((account) => account.id === transferDestinationId)?.name;
      toast.success(`Funds transferred from ${sourceName ?? 'source'} to ${destinationName ?? 'destination'}`);
      setShowTransfer(false);
      setTransferSourceId('');
      setTransferDestinationId('');
      setTransferAmount('');
      setTransferRemarks('');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not transfer funds'),
    onSettled: () => setIsTransferring(false),
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

  function openTransferForm() {
    if (showTransfer) {
      setShowTransfer(false);
      return;
    }
    const source = accountsQuery.data?.cash ?? accountsQuery.data?.banks[0];
    const destination = source?.type === 'CASH' ? accountsQuery.data?.banks[0] : accountsQuery.data?.cash;
    if (!source || !destination) {
      toast.error('A Cash account and at least one Bank account are required');
      return;
    }
    setTransferSourceId(source.id);
    setTransferDestinationId(destination.id);
    setShowTransfer(true);
  }

  function selectTransferSource(accountId: string) {
    const source = transferableAccounts.find((account) => account.id === accountId);
    const destination = source?.type === 'CASH' ? accountsQuery.data?.banks[0] : accountsQuery.data?.cash;
    setTransferSourceId(accountId);
    setTransferDestinationId(destination?.id ?? '');
  }

  function onTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(transferAmount);
    if (!transferSourceId || !transferDestinationId) {
      toast.error('Select both accounts');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (transferSource && amount > Number(transferSource.currentBalance)) {
      toast.error(`Insufficient balance in ${transferSource.name}`);
      return;
    }
    setIsTransferring(true);
    transferMutation.mutate();
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
          <Button variant="outline" onClick={openTransferForm}>
            Transfer Money
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

      {canManage && showTransfer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfer between Bank and Cash</CardTitle>
            <CardDescription>Move money from Cash to a Bank account or from a Bank account to Cash. The company&apos;s total funds stay unchanged.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onTransfer} className="grid gap-4 sm:grid-cols-4 items-end">
              <div className="space-y-2">
                <Label>Transfer from</Label>
                <Select value={transferSourceId || undefined} onValueChange={(value) => value && selectTransferSource(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account">
                      {transferSource ? `${transferSource.name} — ${Number(transferSource.currentBalance).toLocaleString()}` : 'Select account'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {transferableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} — {Number(account.currentBalance).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transfer to</Label>
                <Select value={transferDestinationId || undefined} onValueChange={(value) => value && setTransferDestinationId(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account">
                      {transferDestination ? `${transferDestination.name} — ${Number(transferDestination.currentBalance).toLocaleString()}` : 'Select account'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {transferDestinationOptions.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} — {Number(account.currentBalance).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transferAmount">Amount</Label>
                <Input id="transferAmount" type="number" min="0.01" step="0.01" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transferRemarks">Remarks</Label>
                <Input id="transferRemarks" placeholder="Optional" value={transferRemarks} onChange={(e) => setTransferRemarks(e.target.value)} />
              </div>
              <div className="sm:col-span-4 flex gap-2">
                <Button type="submit" disabled={isTransferring}>
                  {isTransferring ? 'Transferring…' : 'Confirm transfer'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowTransfer(false)}>
                  Cancel
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
