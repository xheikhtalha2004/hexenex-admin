'use client';

import Link from 'next/link';
import { LogOut, UserRound } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AppTopbar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5" />
        <span className="text-xs font-medium text-muted-foreground hidden sm:inline-block">
          Hexenex Platform
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 border-primary/20 bg-primary/5 text-primary">
          {user.roleName.replace('_', ' ')}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring rounded-full">
            <Avatar className="size-8.5 ring-1 ring-border shadow-xs">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                {initials(user.fullName)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 shadow-lg">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="font-semibold text-sm">{user.fullName}</span>
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/profile" />}>
              <UserRound className="mr-2 size-4" />
              Profile &amp; Security
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
