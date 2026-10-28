import type { Metadata } from 'next';
import { and, desc, domains, eq, scans } from '@vuldetected/db';
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
import { getDomainPostureTrends, getSeverityCounts } from '@/features/scans/queries/findings-page';
import { db } from '@/lib/db';
import { SEVERITY_ORDER, getSeverityVariant } from '@/lib/severity/classify';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reports');

  return { title: t('title') };
}

/**
 * Reports: what is open, whether it is improving, and what can be downloaded.
 *
 * ## WHY NO CHART
 *
 * The previous version drew fixed bars from a literal array and had a button that
 * faked a PDF download with a timer. A chart of six numbers the reader can see as
 * six numbers adds nothing, and it hid the fact that the data was invented. The
 * breakdown below is the real count, and the downloads are the same server routes
 * the scan detail already uses — one implementation, one set of bytes.
 *
 * ## WHY THE TREND IS PER DOMAIN, NOT PER ACCOUNT
 *
 * Findings are not comparable across sites: a marketing site with no login and an
 * application with a session will never look alike. Comparing each domain against
 * its own previous completed scan answers "did my fix work" without pretending
 * two unrelated hosts share a baseline.
 */
export default async function ReportsPage() {
  const t = await getTranslations('reports');
  const tScan = await getTranslations('scan');
  const session = await getServerSession();

  if (!session?.user) {
    return (
      <Container size="narrow" className="py-12">
        <EmptyState
          title={t('sessionRequired.title')}
          description={t('sessionRequired.description')}
        />
      </Container>
    );
  }

  const userId = session.user.id;

  const [severity, trends, completedScans] = await Promise.all([
    getSeverityCounts(userId),
    getDomainPostureTrends(userId),
    db()
      .select({
        id: scans.id,
        targetUrl: scans.targetUrl,
        createdAt: scans.createdAt,
        hostname: domains.normalizedHostname,
      })
      .from(scans)
      .innerJoin(domains, eq(scans.domainId, domains.id))
      .where(and(eq(domains.userId, userId), eq(scans.status, 'completed')))
      .orderBy(desc(scans.createdAt))
      .limit(20),
  ]);

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('severity.title')}</CardTitle>
          <CardDescription>{t('severity.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {severity.total === 0 ? (
            <p className="text-sm text-text-muted">{t('severity.empty')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {SEVERITY_ORDER.map((severityKey) => (
                <Badge key={severityKey} variant={getSeverityVariant(severityKey)}>
                  {tScan(`findings.severity.${severityKey}`)} ({severity.counts[severityKey]})
                </Badge>
              ))}
            </div>
          )}
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
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/scans/${trend.latestScanId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {trend.latestAt.toISOString().slice(0, 16).replace('T', ' ')}
                        </Link>
                        <span className="text-xs text-text-muted">
                          {trend.latestRisky} {t('trend.riskyFindings')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {trend.delta === null ? (
                        <Badge variant="neutral">{t('trend.firstScan')}</Badge>
                      ) : trend.delta > 0 ? (
                        <Badge variant="high">
                          {t('trend.worsened')} (+{trend.delta})
                        </Badge>
                      ) : trend.delta < 0 ? (
                        <Badge variant="low">
                          {t('trend.improved')} ({trend.delta})
                        </Badge>
                      ) : (
                        <Badge variant="neutral">{t('trend.unchanged')}</Badge>
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
          <CardTitle>{t('scans.title')}</CardTitle>
          <CardDescription>{t('scans.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {completedScans.length === 0 ? (
            <EmptyState title={t('scans.empty.title')} description={t('scans.empty.description')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('scans.table.target')}</TableHead>
                  <TableHead>{t('scans.table.domain')}</TableHead>
                  <TableHead>{t('scans.table.created')}</TableHead>
                  <TableHead>{t('scans.table.exports')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedScans.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>
                      <Link
                        href={`/scans/${scan.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {scan.targetUrl}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{scan.hostname}</span>
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
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/api/scans/${scan.id}/export?format=csv`}>
                            {tScan('export.csv')}
                          </a>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/api/scans/${scan.id}/export?format=json`}>
                            {tScan('export.json')}
                          </a>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/api/scans/${scan.id}/export/pdf`}>{tScan('export.pdf')}</a>
                        </Button>
                      </div>
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
