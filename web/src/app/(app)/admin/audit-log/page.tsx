'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { PermissionGate } from '@/components/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string } | null;
}
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CREATE: 'default',
  UPDATE: 'secondary',
  DELETE: 'destructive',
  CANCEL: 'destructive',
  FINALIZE: 'default',
  APPROVE: 'default',
  REJECT: 'destructive',
  CONVERT: 'secondary',
};

export default function AuditLogPage() {
  return (
    <PermissionGate permission="audit_log.view">
      <AuditLogContent />
    </PermissionGate>
  );
}

function AuditLogContent() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('ALL');
  const [entityId, setEntityId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const entityTypesQuery = useQuery({
    queryKey: ['audit-entity-types'],
    queryFn: () => apiClient.get<{ entityType: string }[]>('/audit-logs/entity-types'),
  });

  const query = [
    `page=${page}`,
    'pageSize=25',
    entityType !== 'ALL' ? `entityType=${entityType}` : '',
    entityId ? `entityId=${encodeURIComponent(entityId)}` : '',
    dateFrom ? `dateFrom=${dateFrom}` : '',
    dateTo ? `dateTo=${dateTo}` : '',
  ]
    .filter(Boolean)
    .join('&');

  const logsQuery = useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => apiClient.get<Paginated<AuditLogEntry>>(`/audit-logs?${query}`),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">Every create, update, and financial state change across the system, with before/after data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Entity type</Label>
              <Select
                value={entityType}
                onValueChange={(v) => {
                  setEntityType(v ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  {entityTypesQuery.data?.map((t) => (
                    <SelectItem key={t.entityType} value={t.entityType}>
                      {t.entityType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityId">Entity ID</Label>
              <Input
                id="entityId"
                value={entityId}
                onChange={(e) => {
                  setEntityId(e.target.value);
                  setPage(1);
                }}
                className="w-56"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFrom">From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-44"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-44"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
          <CardDescription>Click a row to see the before/after data captured for that change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {logsQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsQuery.data?.data.length ? (
                    logsQuery.data.data.map((log) => (
                      <Fragment key={log.id}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                          <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                          <TableCell>{log.user?.fullName ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={ACTION_VARIANT[log.action] ?? 'outline'}>{log.action}</Badge>
                          </TableCell>
                          <TableCell>{log.entityType}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{log.entityId}</TableCell>
                        </TableRow>
                        {expandedId === log.id && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/30">
                              <div className="grid gap-4 py-2 sm:grid-cols-2">
                                <div>
                                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Before</p>
                                  <pre className="text-xs overflow-x-auto rounded bg-background p-2 border">
                                    {log.beforeData ? JSON.stringify(log.beforeData, null, 2) : '—'}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">After</p>
                                  <pre className="text-xs overflow-x-auto rounded bg-background p-2 border">
                                    {log.afterData ? JSON.stringify(log.afterData, null, 2) : '—'}
                                  </pre>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No audit events match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {logsQuery.data && logsQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Page {logsQuery.data.page} of {logsQuery.data.totalPages} ({logsQuery.data.total} events)
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= logsQuery.data.totalPages} onClick={() => setPage((p) => p + 1)}>
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
