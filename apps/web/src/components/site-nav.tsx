import { Badge, Button, Container } from '@vuldetected/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoutButton } from '@/features/auth/logout-button';
import { getServerSession } from '@/features/auth/session';

/**
 * Primary navigation.
 *
 * ## WHY IT IS A SERVER COMPONENT
 *
 * The nav renders the sign-in/sign-out affordance, which depends on the session.
 * Reading that session on the server means the correct control is present in the
 * FIRST HTML response — no flash of a "Sign in" button on an authenticated page,
 * and no layout shift when it corrects itself after hydration.
 *
 * The nav therefore reads the session itself, and the root layout is a pure
 * shell that stays usable without a database. `getServerSession()` is wrapped in
 * React's `cache()`, so the navigation this component links to can also ask for
 * the session in the same render pass and still cost one query.
 *
 * The nav stays a Server Component: `getTranslations` is the server entry point.
 * Only `LocaleSwitcher` is a client island, because it needs the pending state
 * around the locale server action.
 *
 * ## ONE SPRINT 1 AFFORDANCE
 *
 * The audit saw "Sprint 1 Sprint 1" because the nav link and the status badge
 * carried the same label. The badge is now `nav.badge` ("Sprint 2") and is a
 * status marker, not a link. `/dev/sprint-1` keeps exactly one affordance, with
 * its label from `nav.sprint1`.
 */
export async function SiteNav() {
  const t = await getTranslations('nav');
  const session = await getServerSession();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg">
      <Container size="wide">
        <div className="flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-text-on-brand"
              >
                V
              </span>
              <span className="text-sm font-semibold">VulDetected</span>
            </Link>

            <nav aria-label={t('mainLabel')} className="hidden items-center gap-1 sm:flex">
              <NavLink href="/dashboard">{t('dashboard')}</NavLink>
              <NavLink href="/scans">{t('scans')}</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/*
              The single `/dev/sprint-1` affordance. It sits next to the status
              badge but is deliberately a link, not a second badge: the audit
              defect was two identical labels, not one link plus one status.
              Hidden on the narrowest screens where the header has no room; the
              landing page keeps the same link for those readers.
            */}
            <NavLink href="/dev/sprint-1" className="hidden sm:inline-block">
              {t('sprint1')}
            </NavLink>

            <Badge variant="info">{t('badge')}</Badge>

            <LocaleSwitcher />

            {session?.user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-text-muted md:inline">
                  {session.user.email}
                </span>
                <LogoutButton />
              </div>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">{t('signIn')}</Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link href="/register">{t('createAccount')}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}

function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`focus-ring rounded-md px-2 py-1 text-sm text-text-muted transition-colors duration-150 hover:bg-surface hover:text-text ${className ?? ''}`}
    >
      {children}
    </Link>
  );
}
