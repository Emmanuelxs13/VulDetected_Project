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
import { desc, domains, eq, scans } from '@vuldetected/db';
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

  const [scanList, findingsPage, severityTotals, trends] = await Promise.all([
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
  ]);

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
