'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
import { PermissionGate } from '@/components/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface Category {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { products: number };
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  unit: string;
  reorderLevel: string | null;
  isActive: boolean;
  category: Category;
}

interface PaginatedProducts {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const categorySchema = z.object({ name: z.string().min(1, 'Required') });
type CategoryValues = z.infer<typeof categorySchema>;

const productSchema = z.object({
  categoryId: z.string().min(1, 'Select a category'),
  name: z.string().min(1, 'Required'),
  reorderLevel: z.string().optional(),
});
type ProductValues = z.infer<typeof productSchema>;

export default function ProductsPage() {
  return (
    <PermissionGate permission="product.manage">
      <ProductsContent />
    </PermissionGate>
  );
}

function ProductsContent() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products & Categories</h1>
        <p className="text-muted-foreground">Manage the product catalogue used across quotations, sales, and inventory.</p>
      </div>
      <CategoriesSection />
      <ProductsSection />
    </div>
  );
}

function CategoriesSection() {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: () => apiClient.get<Category[]>('/product-categories') });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryValues>({ resolver: zodResolver(categorySchema) });

  const toggleActive = useMutation({
    mutationFn: (params: { id: string; isActive: boolean }) =>
      apiClient.patch(`/product-categories/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product-categories'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update category'),
  });

  async function onSubmit(values: CategoryValues) {
    setIsSubmitting(true);
    try {
      await apiClient.post('/product-categories', values);
      toast.success('Category created');
      reset();
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
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
        <CardDescription>Gangsaws, counters by size, resize stock — extend as needed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="categoryName">New category name</Label>
            <Input id="categoryName" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Adding…' : 'Add category'}
          </Button>
        </form>

        {categoriesQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {categoriesQuery.data?.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5">
                <span className="text-sm font-medium">{c.name}</span>
                <Badge variant="secondary">{c._count?.products ?? 0} items</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  disabled={toggleActive.isPending}
                  onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })}
                >
                  {c.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductsSection() {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: () => apiClient.get<Category[]>('/product-categories') });
  const productsQuery = useQuery({
    queryKey: ['products', search, categoryFilter, page],
    queryFn: () =>
      apiClient.get<PaginatedProducts>(
        `/products?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}${
          categoryFilter !== 'ALL' ? `&categoryId=${categoryFilter}` : ''
        }`,
      ),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductValues>({ resolver: zodResolver(productSchema) });

  function startEdit(product: Product) {
    setEditingId(product.id);
    setValue('categoryId', product.categoryId);
    setValue('name', product.name);
    setValue('reorderLevel', product.reorderLevel ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
    reset();
  }

  const toggleActive = useMutation({
    mutationFn: (params: { id: string; isActive: boolean }) => apiClient.patch(`/products/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update product'),
  });

  async function onSubmit(values: ProductValues) {
    setIsSubmitting(true);
    const payload = {
      categoryId: values.categoryId,
      name: values.name,
      reorderLevel: values.reorderLevel ? Number(values.reorderLevel) : undefined,
    };
    try {
      if (editingId) {
        await apiClient.patch(`/products/${editingId}`, payload);
        toast.success('Product updated');
      } else {
        await apiClient.post('/products', payload);
        toast.success('Product created');
      }
      cancelEdit();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save product');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{editingId ? 'Edit product' : 'Add product'}</CardTitle>
        <CardDescription>Products are tracked in sq ft across Factory and Showroom.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              items={Object.fromEntries((categoriesQuery.data ?? []).map((c) => [c.id, c.name]))}
              value={watch('categoryId') ?? ''}
              onValueChange={(value) => setValue('categoryId', value ?? '')}
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
            {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="productName">Item name</Label>
            <Input id="productName" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reorderLevel">Reorder level (sq ft)</Label>
            <Input id="reorderLevel" type="number" step="0.01" {...register('reorderLevel')} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : editingId ? 'Update' : 'Add product'}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </form>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-56"
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {categoriesQuery.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {productsQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Reorder level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsQuery.data?.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.category.name}</TableCell>
                    <TableCell>{p.reorderLevel ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleActive.isPending}
                        onClick={() => toggleActive.mutate({ id: p.id, isActive: !p.isActive })}
                      >
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {productsQuery.data && productsQuery.data.totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {productsQuery.data.page} of {productsQuery.data.totalPages} ({productsQuery.data.total} items)
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= productsQuery.data.totalPages}
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
