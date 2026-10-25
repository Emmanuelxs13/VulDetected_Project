'use client';

import { Button } from '@vuldetected/ui';
import { MobileSidebar } from './app-sidebar';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from '@/features/auth/logout-button';

type Session = {
  user?: {
    email?: string | null;
    name?: string | null;
  } | null;
} | null;

export function AppHeader({ session }: { session: Session }) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-bg px-4 lg:px-6">
      <MobileSidebar />
      <div className="flex-1">
        <input
          type="search"
          placeholder="Buscar..."
          className="h-8 w-full max-w-sm rounded-md border border-border bg-surface px-3 text-sm"
          aria-label="Buscar"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="Notificaciones">
          🔔
        </Button>
        <LocaleSwitcher />
        {session?.user && (
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-text-muted md:inline">{session.user.email}</span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}
