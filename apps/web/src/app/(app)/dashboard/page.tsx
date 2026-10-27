import type { Metadata } from 'next';
import { and, desc, domains, eq, scans, sql } from '@vuldetected/db';
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
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { ScanStatusBadge } from '@/features/scans/components/scan-status';
import type { ScanStatus } from '@/features/scans/components/scan-status';
import { getSeverityCounts } from '@/features/scans/queries/findings-page';
import { db } from '@/lib/db';
import { SEVERITY_ORDER, getSeverityVariant } from '@/lib/severity/classify';
import { levelFromCounts } from '@/lib/severity/traffic-light';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');

  return { title: t('title') };
}

/** Badge variant for the traffic light. Reuses the severity palette. */
const RISK_VARIANT = {
  high: 'critical',
  medium: 'medium',
  safe: 'low',
} as const;

/**
 * The account's security posture.
 *
 * ## WHY EVERY NUMBER HERE IS A QUERY
 *
 * The previous version of this page rendered literal zeros next to a "total
 * scans" heading. A dashboard that always says zero is worse than no dashboard:
 * it is read as evidence that nothing is wrong. Every figure below is a
 * `count(*)` over the caller's own rows, and every severity figure excludes
 * findings the reader has already resolved or dismissed, so the light responds
 * to the work they do.
 *
 * ## WHY THE LIGHT IS NOT A SCORE
 *
 * See `lib/severity/posture.ts`: open findings collapse to three states through
 * a rule the counts underneath can be checked against.
 */
export default async function DashboardPage() {
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

  const userId = session.user.id;

  const [verifiedDomainRows, scanTotalRows, severity, recentScans] = await Promise.all([
    db()
      .select({ total: sql<number>`count(*)::int` })
      .from(domains)
      .where(and(eq(domains.userId, userId), eq(domains.verified, true))),
    db()
      .select({ total: sql<number>`count(*)::int` })
      .from(scans)
      .innerJoin(domains, eq(scans.domainId, domains.id))
      .where(eq(domains.userId, userId)),
    getSeverityCounts(userId),
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
      .limit(8),
  ]);

  const verifiedDomains = verifiedDomainRows[0]?.total ?? 0;
  const totalScans = scanTotalRows[0]?.total ?? 0;
  const risk = levelFromCounts(severity.counts);
  const risky = severity.counts.critical + severity.counts.high;

  const stats = [
    { key: 'domains', label: t('stats.domains'), value: verifiedDomains },
    { key: 'scans', label: t('stats.scans'), value: totalScans },
    { key: 'findings', label: t('stats.openFindings'), value: severity.total },
    { key: 'risky', label: t('stats.riskyFindings'), value: risky },
  ];

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>

      <Card className={risk === 'high' ? 'border-critical/50 bg-critical-tint' : undefined}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('risk.label')}</CardTitle>
          <Badge variant={RISK_VARIANT[risk]}>{t(`risk.${risk}`)}</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">{t(`risk.${risk}Hint`)}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="tabular text-2xl font-semibold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>{t('severity.title')}</CardTitle>
            <CardDescription>{t('severity.description')}</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/findings">{t('severity.viewAll')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {severity.total === 0 ? (
            <p className="text-sm text-text-muted">{t('severity.empty')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {SEVERITY_ORDER.map((severityKey) => (
                <Button
                  asChild
                  key={severityKey}
                  variant="ghost"
                  size="sm"
                  aria-label={`${tScan(`findings.severity.${severityKey}`)}: ${severity.counts[severityKey]}`}
                >
                  <Link href={`/findings?severity=${severityKey}`}>
                    <Badge variant={getSeverityVariant(severityKey)}>
                      {tScan(`findings.severity.${severityKey}`)} ({severity.counts[severityKey]})
                    </Badge>
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>{t('recent.title')}</CardTitle>
            <CardDescription>{t('recent.description')}</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/scans">{t('recent.viewAll')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentScans.length === 0 ? (
            <EmptyState title={t('recent.empty')} description={t('recent.emptyHint')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tScan('list.table.target')}</TableHead>
                  <TableHead>{tScan('list.table.domain')}</TableHead>
                  <TableHead>{tScan('list.table.status')}</TableHead>
                  <TableHead>{tScan('list.table.created')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{tScan('list.table.detail')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentScans.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{scan.targetUrl}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{scan.hostname}</span>
                    </TableCell>
                    <TableCell>
                      <ScanStatusBadge status={scan.status as ScanStatus} />
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
    </Container>
  );
}
