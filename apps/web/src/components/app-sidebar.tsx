'use client';

import { Button } from '@vuldetected/ui';
import { cn } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@vuldetected/ui';
import {
  IconDashboard,
  IconScan,
  IconFindings,
  IconReport,
  IconGuides,
  IconSchedule,
  IconSettings,
} from '@/components/icons';

/**
 * The product's navigation.
 *
 * Every entry points at a route that reads real data. The previous list mixed
 * real pages with placeholders, so a click could land on a screen whose numbers
 * were invented; the destinations below are the ones the account can actually
 * inspect.
 *
 * `/scans` owns both the ownership flow and the scheduled scans, which is why
 * "New scan" and "Schedules" are not separate entries: they are cards on that
 * page, not destinations that pretend to exist on their own.
 */
function useNavItems() {
  const t = useTranslations('nav');

  return [
    { href: '/dashboard', label: t('dashboard'), icon: IconDashboard },
    { href: '/scanner', label: 'Escáner', icon: IconScan },
    { href: '/scans', label: t('scans'), icon: IconScan },
    { href: '/findings', label: t('findings'), icon: IconFindings },
    { href: '/reports', label: t('reports'), icon: IconReport },
    { href: '/remediation', label: t('remediation'), icon: IconGuides },
    { href: '/schedules', label: t('schedules'), icon: IconSchedule },
    { href: '/settings', label: t('settings'), icon: IconSettings },
  ];
}

export function AppSidebar({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const navItems = useNavItems();
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
          aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          {collapsed ? '→' : '←'}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-raised',
                isActive ? 'bg-surface-raised text-text font-medium' : 'text-text-muted',
                collapsed && 'justify-center',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileSidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const navItems = useNavItems();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="lg:hidden" aria-label={t('openMenu')}>
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
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-surface-raised',
                  isActive ? 'bg-surface-raised text-text font-medium' : 'text-text-muted',
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
