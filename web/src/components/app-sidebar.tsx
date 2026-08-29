'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Factory } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth-context';
import { NAV_SECTIONS } from '@/lib/nav-config';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function AppSidebar() {
  const { hasPermission } = useAuth();
  const pathname = usePathname();

  const settingsQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get<{ companyName: string }>('/company-settings'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const appName = settingsQuery.data?.data?.companyName || 'Marble & Granite ERP';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Factory className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            {appName}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => {
            if (!item.permission) return true;
            return Array.isArray(item.permission) ? item.permission.some(hasPermission) : hasPermission(item.permission);
          });
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={section.title}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={pathname.startsWith(item.href)}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
