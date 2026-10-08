import { Badge, Button, Container } from '@vuldetected/ui';
import Link from 'next/link';

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
 */
export async function SiteNav() {
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

            <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/dev/sprint-1">Sprint 1</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/*
              Sprint 1 has exactly one implemented feature, so the nav says so
              rather than linking to pages that would 404. A nav full of dead
              links is how a demo starts lying.
            */}
            <Badge variant="info">Sprint 1</Badge>

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
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link href="/register">Create account</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-ring rounded-md px-2 py-1 text-sm text-text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
    >
      {children}
    </Link>
  );
}
