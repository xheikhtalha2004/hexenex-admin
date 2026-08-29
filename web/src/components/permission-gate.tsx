'use client';

import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function PermissionGate({
  permission,
  children,
}: {
  permission: string | string[];
  children: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  const allowed = Array.isArray(permission) ? permission.some(hasPermission) : hasPermission(permission);
  if (!allowed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center text-muted-foreground">
        <ShieldAlert className="size-8" />
        <p>You don&apos;t have access to this section.</p>
      </div>
    );
  }
  return <>{children}</>;
}
