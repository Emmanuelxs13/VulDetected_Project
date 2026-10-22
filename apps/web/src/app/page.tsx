import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
} from '@vuldetected/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';

/**
 * Landing page.
 *
 * ## THE HONEST VERSION
 *
 * This page lists what actually works. Sprint 1 shipped the data layer and
 * authentication; Sprint 2 added domain ownership verification and the scan
 * pipeline. CVE correlation and integrations are still not built. A landing page
 * that implies otherwise is not marketing, it is a false capability claim to
 * anyone evaluating the project, and it makes the empty dashboard look broken
 * rather than early.
 *
 * So the feature list is real, and the not-real part is stated plainly.
 */
export default async function HomePage() {
  const t = await getTranslations('home');
  const session = await getServerSession();

  return (
    <Container size="narrow" className="flex flex-col gap-8 py-12">
      <section className="flex flex-col gap-4">
        <Badge variant="neutral">{t('badge')}</Badge>

        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>

        <p className="max-w-prose text-sm leading-6 text-text-muted">{t('intro')}</p>

        <div className="flex flex-wrap items-center gap-2">
          {session?.user ? (
            <Button asChild variant="primary">
              <Link href="/dashboard">{t('actions.dashboard')}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="primary">
                <Link href="/register">{t('actions.createAccount')}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/login">{t('actions.signIn')}</Link>
              </Button>
            </>
          )}
          <Button asChild variant="ghost">
            <Link href="/dev/sprint-1">{t('actions.seeWhatWorks')}</Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('worked.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-text-muted">
            <Worked item={t('worked.items.schema')} />
            <Worked item={t('worked.items.auth')} />
            <Worked item={t('worked.items.hashing')} />
            <Worked item={t('worked.items.audit')} />
            <Worked item={t('worked.items.lockout')} />
            <Worked item={t('worked.items.ownership')} />
            <Worked item={t('worked.items.scanQueue')} />
            <Worked item={t('worked.items.scanChecks')} />
            <Worked item={t('worked.items.liveProgress')} />
          </ul>
        </CardContent>
      </Card>

      <Alert variant="info" title={t('notBuilt.title')} description={t('notBuilt.description')} />

      {/*
        The `/dev/sprint-1` page is the answer to "how do I verify this works?"
        without a seeded database or a terminal full of curl commands.
      */}
      {!session?.user ? (
        <EmptyState
          title={t('signInPrompt.title')}
          description={t('signInPrompt.description')}
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/login">{t('signInPrompt.action')}</Link>
            </Button>
          }
        />
      ) : null}
    </Container>
  );
}

function Worked({ item }: { item: string }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-low" />
      {item}
    </li>
  );
}
