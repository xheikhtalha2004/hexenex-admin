'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

interface Location {
  id: string;
  name: string;
  type: string;
}
interface Category {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  categoryId: string;
}
interface BalanceRow {
  productId: string;
  productName: string;
  categoryName: string;
  locationId: string;
  locationName: string;
  quantity: string;
  reorderLevel: string | null;
  isLowStock: boolean;
}
interface MovementRow {
  id: string;
  movementType: string;
  quantity: string;
  unitCost: string | null;
  movementDate: string;
  remarks: string | null;
  product: { name: string };
  location: { name: string };
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export default function InventoryPage() {
  return (
    <PermissionGate permission="inventory.view">
      <InventoryContent />
    </PermissionGate>
  );
}

function InventoryContent() {
  const { hasPermission } = useAuth();
  const locationsQuery = useQuery({ queryKey: ['locations'], queryFn: () => apiClient.get<Location[]>('/locations') });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: () => apiClient.get<Category[]>('/product-categories') });
  const productsQuery = useQuery({
    queryKey: ['products-for-inventory'],
    queryFn: () => apiClient.get<Product[]>('/product-picker'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground">Stock by location, with a full movement trail behind every change.</p>
      </div>

      <BalancesSection locations={locationsQuery.data ?? []} categories={categoriesQuery.data ?? []} />

      {(hasPermission('stock_transfer.create') || hasPermission('stock_adjustment.create')) && (
        <div className="grid gap-6 md:grid-cols-2">
          {hasPermission('stock_transfer.create') && (
            <TransferSection locations={locationsQuery.data ?? []} products={productsQuery.data ?? []} />
          )}
          {hasPermission('stock_adjustment.create') && (
            <AdjustmentSection locations={locationsQuery.data ?? []} products={productsQuery.data ?? []} />
          )}
        </div>
      )}

      <MovementsSection locations={locationsQuery.data ?? []} products={productsQuery.data ?? []} />
    </div>
  );
}

function BalancesSection({ locations, categories }: { locations: Location[]; categories: Category[] }) {
  const searchParams = useSearchParams();
  const [locationId, setLocationId] = useState('ALL');
  const [categoryId, setCategoryId] = useState('ALL');
  // DSH-02: the Dashboard's low stock card links here with ?lowStockOnly=true so the filter is
  // already applied on arrival, rather than landing on the unfiltered list.
  const [lowStockOnly, setLowStockOnly] = useState(() => searchParams.get('lowStockOnly') === 'true');

  const balancesQuery = useQuery({
    queryKey: ['inventory-balances', locationId, categoryId, lowStockOnly],
    queryFn: () =>
      apiClient.get<BalanceRow[]>(
        `/inventory/balances?${locationId !== 'ALL' ? `locationId=${locationId}&` : ''}${
          categoryId !== 'ALL' ? `categoryId=${categoryId}&` : ''
        }${lowStockOnly ? 'lowStockOnly=true' : ''}`,
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stock balances</CardTitle>
        <CardDescription>Current quantity per product, per location (sq ft)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Location</Label>
            <Select
              items={{ ALL: 'All locations', ...Object.fromEntries(locations.map((l) => [l.id, l.name])) }}
              value={locationId}
              onValueChange={(v) => setLocationId(v ?? 'ALL')}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              items={{ ALL: 'All categories', ...Object.fromEntries(categories.map((c) => [c.id, c.name])) }}
              value={categoryId}
              onValueChange={(v) => setCategoryId(v ?? 'ALL')}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant={lowStockOnly ? 'default' : 'outline'} onClick={() => setLowStockOnly((v) => !v)}>
            Low stock only
          </Button>
        </div>

        {balancesQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Quantity (sq ft)</TableHead>
                <TableHead className="text-right">Reorder level</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balancesQuery.data?.length ? (
                balancesQuery.data.map((row) => (
                  <TableRow key={`${row.productId}:${row.locationId}`}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell>{row.categoryName}</TableCell>
                    <TableCell>{row.locationName}</TableCell>
                    <TableCell className="text-right font-mono">{Number(row.quantity).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{row.reorderLevel ?? '—'}</TableCell>
                    <TableCell>
                      {row.isLowStock && <Badge variant="destructive">Low stock</Badge>}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No matching stock rows.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const transferSchema = z.object({
  fromLocationId: z.string().min(1, 'Required'),
  toLocationId: z.string().min(1, 'Required'),
  productId: z.string().min(1, 'Required'),
  quantity: z.string().min(1, 'Required'),
  remarks: z.string().optional(),
});
type TransferValues = z.infer<typeof transferSchema>;

function TransferSection({ locations, products }: { locations: Location[]; products: Product[] }) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransferValues>({ resolver: zodResolver(transferSchema) });

  async function onSubmit(values: TransferValues) {
    setIsSubmitting(true);
    try {
      await apiClient.post('/inventory/transfers', {
        fromLocationId: values.fromLocationId,
        toLocationId: values.toLocationId,
        remarks: values.remarks || undefined,
        items: [{ productId: values.productId, quantity: Number(values.quantity) }],
      });
      toast.success('Stock transferred');
      reset();
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not transfer stock');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transfer stock</CardTitle>
        <CardDescription>Factory ↔ Showroom</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From</Label>
              <Select
                items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
                value={watch('fromLocationId') ?? ''}
                onValueChange={(v) => setValue('fromLocationId', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.fromLocationId && <p className="text-sm text-destructive">{errors.fromLocationId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Select
                items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
                value={watch('toLocationId') ?? ''}
                onValueChange={(v) => setValue('toLocationId', v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.toLocationId && <p className="text-sm text-destructive">{errors.toLocationId.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              items={Object.fromEntries(products.map((p) => [p.id, p.name]))}
              value={watch('productId') ?? ''}
              onValueChange={(v) => setValue('productId', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.productId && <p className="text-sm text-destructive">{errors.productId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity (sq ft)</Label>
            <Input id="quantity" type="number" step="0.01" {...register('quantity')} />
            {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="transferRemarks">Remarks</Label>
            <Input id="transferRemarks" {...register('remarks')} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Transferring…' : 'Transfer stock'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const adjustmentSchema = z.object({
  locationId: z.string().optional(),
  productId: z.string().min(1, 'Required'),
  reason: z.string().min(1, 'Required'),
  quantityDelta: z.string().min(1, 'Required'),
  unitCostOverride: z.string().optional(),
  remarks: z.string().optional(),
});
type AdjustmentValues = z.infer<typeof adjustmentSchema>;

const ADJUSTMENT_REASONS = ['DAMAGE', 'THEFT', 'RECOUNT', 'CORRECTION', 'OTHER'];

function AdjustmentSection({ locations, products }: { locations: Location[]; products: Product[] }) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AdjustmentValues>({ resolver: zodResolver(adjustmentSchema) });
  const reason = watch('reason');
  const alwaysSubtracts = reason === 'DAMAGE' || reason === 'THEFT';

  // Adjustments default to Factory until the user picks a different location.
  const defaultFactoryLocation = locations.find((l) => l.name.toLowerCase().includes('factory'));
  const effectiveLocationId = watch('locationId') || defaultFactoryLocation?.id || '';

  async function onSubmit(values: AdjustmentValues) {
    setIsSubmitting(true);
    try {
      const rawDelta = Number(values.quantityDelta);
      // Damage and theft always remove stock — force negative regardless of the sign
      // typed, since operators naturally enter the lost quantity as a plain positive
      // number and a forgotten minus sign was silently adding to stock instead.
      const alwaysSubtracts = values.reason === 'DAMAGE' || values.reason === 'THEFT';
      const quantityDelta = alwaysSubtracts ? -Math.abs(rawDelta) : rawDelta;
      await apiClient.post('/inventory/adjustments', {
        locationId: values.locationId || defaultFactoryLocation?.id,
        reason: values.reason,
        remarks: values.remarks || undefined,
        items: [
          {
            productId: values.productId,
            quantityDelta,
            unitCostOverride: values.unitCostOverride ? Number(values.unitCostOverride) : undefined,
          },
        ],
      });
      toast.success('Stock adjustment recorded');
      reset();
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record adjustment');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Adjust stock</CardTitle>
        <CardDescription>
          Damage and theft always remove stock. Recount and correction can go either way — use a negative quantity to remove
          stock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Location</Label>
            <Select
              items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
              value={effectiveLocationId}
              onValueChange={(v) => setValue('locationId', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.locationId && <p className="text-sm text-destructive">{errors.locationId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              items={Object.fromEntries(products.map((p) => [p.id, p.name]))}
              value={watch('productId') ?? ''}
              onValueChange={(v) => setValue('productId', v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.productId && <p className="text-sm text-destructive">{errors.productId.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={watch('reason') ?? ''} onValueChange={(v) => setValue('reason', v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantityDelta">
                {alwaysSubtracts ? 'Quantity lost (sq ft)' : 'Quantity delta (sq ft)'}
              </Label>
              <Input
                id="quantityDelta"
                type="number"
                step="0.01"
                placeholder={alwaysSubtracts ? 'e.g. 6' : 'e.g. -12 or 50'}
                {...register('quantityDelta')}
              />
              {alwaysSubtracts && (
                <p className="text-xs text-muted-foreground">Entered as a plain number — this will always be subtracted from stock.</p>
              )}
              {errors.quantityDelta && <p className="text-sm text-destructive">{errors.quantityDelta.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unitCostOverride">Unit cost override (optional)</Label>
            <Input id="unitCostOverride" type="number" step="0.0001" {...register('unitCostOverride')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjustmentRemarks">Remarks</Label>
            <Input id="adjustmentRemarks" {...register('remarks')} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Record adjustment'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MovementsSection({ locations, products }: { locations: Location[]; products: Product[] }) {
  const [locationId, setLocationId] = useState('ALL');
  const [productId, setProductId] = useState('ALL');
  const [page, setPage] = useState(1);

  const movementsQuery = useQuery({
    queryKey: ['inventory-movements', locationId, productId, page],
    queryFn: () =>
      apiClient.get<Paginated<MovementRow>>(
        `/inventory/movements?page=${page}&pageSize=20${locationId !== 'ALL' ? `&locationId=${locationId}` : ''}${
          productId !== 'ALL' ? `&productId=${productId}` : ''
        }`,
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Movement history</CardTitle>
        <CardDescription>Every stock-affecting event, permanent and append-only</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Location</Label>
            <Select
              value={locationId}
              onValueChange={(v) => {
                setLocationId(v ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Product</Label>
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {movementsQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsQuery.data?.data.length ? (
                  movementsQuery.data.data.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{new Date(m.movementDate).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{m.product.name}</TableCell>
                      <TableCell>{m.location.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.movementType.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(m.quantity) >= 0 ? '+' : ''}
                        {Number(m.quantity).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">{m.unitCost ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{m.remarks ?? '—'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No movements recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {movementsQuery.data && movementsQuery.data.totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {movementsQuery.data.page} of {movementsQuery.data.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= movementsQuery.data.totalPages}
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
  );
}
