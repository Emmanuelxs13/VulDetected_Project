'use client';

import { Button } from '@vuldetected/ui';
import { cn } from '@vuldetected/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@vuldetected/ui';

const navItems = [
  { href: '/dashboard', label: 'Panel', icon: '📊' },
  { href: '/scanner/new', label: 'Nuevo Escaneo', icon: '🔍' },
  { href: '/scans/active', label: 'Escaneos en Curso', icon: '⏱️' },
  { href: '/schedules', label: 'Programación y Alertas', icon: '📅' },
  { href: '/reports', label: 'Informes', icon: '📄' },
  { href: '/findings', label: 'Hallazgos / Vulnerabilidades', icon: '⚠️' },
  { href: '/remediation', label: 'Guías de Remediación', icon: '📚' },
  { href: '/settings', label: 'Configuración', icon: '⚙️' },
];

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'hidden border-r border-border bg-surface lg:flex lg:flex-col transition-all duration-300',
        collapsed ? 'lg:w-16' : 'lg:w-64',
        className,
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-text-on-brand">
              V
            </span>
            <span className="text-sm font-semibold">VulDetected</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? '→' : '←'}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-raised',
                isActive ? 'bg-surface-raised text-text font-medium' : 'text-text-muted',
                collapsed && 'justify-center',
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="text-base">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileSidebar() {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="lg:hidden">
          ☰
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-14 items-center px-4 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-text-on-brand">
              V
            </span>
            <span className="text-sm font-semibold">VulDetected</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-raised',
                  isActive ? 'bg-surface-raised text-text font-medium' : 'text-text-muted',
                )}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
