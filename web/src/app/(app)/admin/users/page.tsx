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

interface Role {
  id: string;
  name: string;
}

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'DISABLED';
  role: Role;
  createdAt: string;
}

const createUserSchema = z.object({
  fullName: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  roleId: z.string().min(1, 'Select a role'),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

export default function UsersAdminPage() {
  return (
    <PermissionGate permission="user.manage">
      <UsersAdminContent />
    </PermissionGate>
  );
}

function UsersAdminContent() {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => apiClient.get<AdminUser[]>('/users') });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => apiClient.get<Role[]>('/roles') });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateUserValues>({ resolver: zodResolver(createUserSchema) });

  const toggleStatus = useMutation({
    mutationFn: (params: { id: string; status: 'ACTIVE' | 'DISABLED' }) =>
      apiClient.patch(`/users/${params.id}/status`, { status: params.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update status'),
  });

  async function onSubmit(values: CreateUserValues) {
    setIsSubmitting(true);
    try {
      await apiClient.post('/users', values);
      toast.success('User created');
      reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create user');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground">Manage staff accounts and roles.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add user</CardTitle>
          <CardDescription>New users can sign in immediately with the password set here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" {...register('fullName')} />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                items={Object.fromEntries((rolesQuery.data ?? []).map((role) => [role.id, role.name.replace('_', ' ')]))}
                value={watch('roleId') ?? ''}
                onValueChange={(value) => setValue('roleId', value ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {rolesQuery.data?.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.roleId && <p className="text-sm text-destructive">{errors.roleId.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.data?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.role.name.replace('_', ' ')}</TableCell>
                    <TableCell>
                      <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'}>{u.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleStatus.isPending}
                        onClick={() =>
                          toggleStatus.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
                        }
                      >
                        {u.status === 'ACTIVE' ? 'Disable' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
