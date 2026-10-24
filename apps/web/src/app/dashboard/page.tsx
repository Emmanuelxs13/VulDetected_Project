import type { Metadata } from 'next';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vuldetected/ui';
import Link from 'next/link';
import { desc, domains, eq, notifications, scans, users } from '@vuldetected/db';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { FindingsList } from '@/features/scans/components/findings-list';
import { FindingsPagination } from '@/features/scans/components/findings-pagination';
import {
  getDomainPostureTrends,
  getSeverityCounts,
  listFindingsPage,
} from '@/features/scans/queries/findings-page';
import { db } from '@/lib/db';
import { SEVERITY_ORDER, getSeverityVariant } from '@/lib/severity/classify';
import { getPlanDefinition } from '@/lib/plans';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');

  return { title: t('title') };
}

/**
 * Protected page.
 *
 * ## THE ONLY THING THAT MAKES THIS PROTECTED
 *
 * `getServerSession()` returns `null` without a valid cookie, and this page shows
 * nothing protected in that case. The protection is a server-side data decision —
 * not a redirect, not a hidden route, not a client-side check.
 *
 * Deliberately NOT implemented here:
 *
 *   - **middleware.ts.** A matcher that redirects unauthenticated users is the
 *     conventional choice and the wrong one for this page: middleware runs on the
 *     edge runtime, which has no database and no cookie signing secret it can
 *     trust, so it could only check for the cookie's *presence*. That check is
 *     trivially bypassed by sending any string named `vuldetected.session_token`,
 *     and it produces a redirect flash for a user whose session merely expired.
 *     Verifying the signature where the secret and the database live is the only
 *     real check.
 *   - **client-side gating.** Content rendered then hidden is content that was
 *     already sent.
 *
 * See `docs/adr/0002-authentication.md` §4.
 *
 * ## WHY EVERY READ IS BOUNDED
 *
 * A domain can hold tens of thousands of findings. The severity breakdown is a
 * `GROUP BY` that returns at most six rows, the findings table is a keyset page of
 * 50, and the trend reads the newest 40 completed scans. No query here scales with
 * the size of the findings table (roadmap exit criterion 4).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ severity?: string; cursor?: string }>;
}) {
  const query = (await searchParams) || {};
  const t = await getTranslations('dashboard');
  const tScan = await getTranslations('scan');
  const session = await getServerSession();

  if (!session?.user) {
    return (
      <Container size="narrow" className="py-12">
        <EmptyState title={t('noSession.title')} description={t('noSession.description')} />
      </Container>
    );
  }

  const { user } = session;
  const userId = user.id;

  const [scanList, findingsPage, severityTotals, trends, accountRows, alertRows] = await Promise.all([
    db()
      .select({
        id: scans.id,
        targetUrl: scans.targetUrl,
        status: scans.status,
        createdAt: scans.createdAt,
        hostname: domains.normalizedHostname,
      })
      .from(scans)
      .innerJoin(domains, eq(scans.domainId, domains.id))
      .where(eq(domains.userId, userId))
      .orderBy(desc(scans.createdAt))
      .limit(20),
    listFindingsPage({ ownerUserId: userId, severity: query.severity, cursor: query.cursor }),
    getSeverityCounts(userId),
    getDomainPostureTrends(userId),
    db()
      .select({ subscriptionPlan: users.subscriptionPlan, subscriptionStatus: users.subscriptionStatus })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db()
      .select({ id: notifications.id, message: notifications.message, createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(5),
  ]);
  const account = accountRows[0];
  const plan = getPlanDefinition(account?.subscriptionPlan ?? 'free');
  const criticalCount = severityTotals.counts.critical;
  const highCount = severityTotals.counts.high;
  const riskLabel = criticalCount > 0 || highCount > 0 ? 'High risk' : 'Secure';

  return (
    <Container size="narrow" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.name?.trim() ? user.name : t('fallbackName')}
        </h1>
        <p className="text-sm text-text-muted">{user.email}</p>
      </div>

      {/*
        `status` is a Better Auth `additionalFields` value, which is why it is
        readable on `user` at all. The schema default is `'active'`: email
        verification is off in Sprint 1, and defaulting to a non-active state
        with no transition path that would activate it would lock out every
        account (`docs/decisions-pending.md` §1).
      */}
      <Card>
        <CardHeader>
          <CardTitle>{t('account.title')}</CardTitle>
          <CardDescription>{t('account.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Row label={t('account.email')}>
              <span className="text-sm">{user.email}</span>
            </Row>
            <Row label={t('account.verified')}>
              {user.emailVerified ? (
                <Badge variant="low">{t('account.verified')}</Badge>
              ) : (
                <Badge variant="unknown">{t('account.notVerified')}</Badge>
              )}
            </Row>
            <Row label={t('account.status')}>
              <Badge variant={statusVariant(user.status)}>{user.status ?? 'pending'}</Badge>
            </Row>
            <Row label={t('account.locale')}>
              <span className="text-sm">{user.locale ?? 'es'}</span>
            </Row>
            <Row label={t('account.userId')}>
              {/*
                `tabular` on the badge forces `font-variant-numeric:
                tabular-nums`, so a hex id does not shift the layout column as it
                renders.
              */}
              <span className="font-mono text-xs text-text-muted">{user.id}</span>
            </Row>
            <Row label={t('account.memberSince')}>
              <span className="text-sm">
                {user.createdAt instanceof Date ? user.createdAt.toISOString().slice(0, 10) : '—'}
              </span>
            </Row>
          </dl>
        </CardContent>
      </Card>

      <Card className={criticalCount > 0 ? 'border-critical' : 'border-low'}>
        <CardHeader>
          <CardTitle>Current security posture</CardTitle>
          <CardDescription>Open findings from the latest account data.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <Badge variant={criticalCount > 0 ? 'critical' : highCount > 0 ? 'high' : 'low'}>
            {riskLabel}
          </Badge>
          <p className="text-sm text-text-muted">
            {criticalCount} critical · {highCount} high · {severityTotals.total} open findings
          </p>
        </CardContent>
      </Card>

      {alertRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Recent plan-enabled security alerts.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {alertRows.map((alert) => (
              <div key={alert.id} className="flex justify-between gap-4 text-sm">
                <span>{alert.message}</span>
                <time className="text-text-muted" dateTime={alert.createdAt.toISOString()}>
                  {alert.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                </time>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>{plan.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{plan.name}</p>
              <p className="text-sm text-text-muted">
                Status: {account?.subscriptionStatus ?? 'active'}
              </p>
            </div>
            <ul className="grid gap-1 text-sm text-text-muted sm:grid-cols-2">
              <li>Monthly scans: {plan.monthlyScans ?? 'Unlimited'}</li>
              <li>Concurrent scans: {plan.concurrentScans}</li>
              <li>Scheduled scans: {plan.scheduledScans}</li>
              <li>Private targets: {plan.privateTargets ? 'Included' : 'Not included'}</li>
              <li>Executive PDF: {plan.pdfExport ? 'Included' : 'Not included'}</li>
              <li>Critical alerts: {plan.criticalAlerts ? 'Included' : 'Not included'}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('severityBreakdown')}</CardTitle>
          <CardDescription>{t('filterDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant={!query.severity ? 'secondary' : 'ghost'} size="sm">
            <Link href="/dashboard">
              {t('filterAll')} ({severityTotals.total})
            </Link>
          </Button>
          {SEVERITY_ORDER.map((severity) => (
            <Button
              asChild
              key={severity}
              variant={query.severity === severity ? 'secondary' : 'ghost'}
              size="sm"
            >
              <Link href={`/dashboard?severity=${severity}`}>
                <Badge variant={getSeverityVariant(severity)}>
                  {tScan(`findings.severity.${severity}`)} ({severityTotals.counts[severity]})
                </Badge>
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('trend.title')}</CardTitle>
          <CardDescription>{t('trend.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {trends.length === 0 ? (
            <p className="text-sm text-text-muted">{t('trend.empty')}</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid gap-3" aria-label="Risk trend chart">
                {trends.map((trend) => {
                  const max = Math.max(trend.latestRisky, trend.previousRisky ?? 0, 1);
                  return (
                    <div key={`chart-${trend.latestScanId}`} className="grid gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono">{trend.hostname}</span>
                        <span>{trend.latestRisky}</span>
                      </div>
                      <div className="h-2 rounded bg-surface-muted">
                        <div
                          className="h-2 rounded bg-primary transition-[width]"
                          style={{ width: `${Math.round((trend.latestRisky / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('trend.table.domain')}</TableHead>
                  <TableHead>{t('trend.table.latest')}</TableHead>
                  <TableHead>{t('trend.table.delta')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trends.map((trend) => (
                  <TableRow key={trend.latestScanId}>
                    <TableCell>
                      <span className="font-mono text-xs">{trend.hostname}</span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/scans/${trend.latestScanId}`}
                        className="text-xs hover:underline"
                      >
                        {trend.latestRisky} {t('trend.riskyFindings')}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {trend.delta === null ? (
                        <Badge variant="unknown">{t('trend.firstScan')}</Badge>
                      ) : trend.delta < 0 ? (
                        <Badge variant="low">
                          {t('trend.improved')} ({trend.delta})
                        </Badge>
                      ) : trend.delta > 0 ? (
                        <Badge variant="high">
                          {t('trend.worsened')} (+{trend.delta})
                        </Badge>
                      ) : (
                        <Badge variant="info">{t('trend.unchanged')}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('scans')}</CardTitle>
          <CardDescription>{t('scansDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {scanList.length === 0 ? (
            <EmptyState
              title={tScan('list.empty.title')}
              description={tScan('list.empty.description')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tScan('list.table.domain')}</TableHead>
                  <TableHead>{tScan('list.table.status')}</TableHead>
                  <TableHead>{tScan('list.table.created')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanList.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{scan.hostname}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">
                        {tScan.has(`status.${scan.status}` as never)
                          ? tScan(`status.${scan.status}` as never)
                          : scan.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <time
                        className="tabular text-xs text-text-muted"
                        dateTime={scan.createdAt.toISOString()}
                      >
                        {scan.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                      </time>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/scans/${scan.id}`}>{tScan('list.table.viewDetails')}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('findingsList')}</CardTitle>
          <CardDescription>{t('findings.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FindingsList findings={findingsPage.rows} />
          <FindingsPagination
            basePath="/dashboard"
            params={{ severity: query.severity }}
            nextCursor={findingsPage.nextCursor}
            isPaged={Boolean(query.cursor)}
          />
        </CardContent>
      </Card>
    </Container>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

/**
 * Maps an account status onto the design system's severity vocabulary.
 *
 * `deleted` is rendered as `unknown`, not `critical`: a deleted account is not an
 * alarm, and colouring it red would train the reader to ignore red. Severity
 * colour has to mean something every time it appears (ADR 0003 §5).
 */
function statusVariant(status: unknown) {
  switch (status) {
    case 'active':
      return 'low' as const;
    case 'suspended':
      return 'high' as const;
    case 'deleted':
      return 'unknown' as const;
    default:
      return 'info' as const;
  }
}
