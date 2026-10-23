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
import { InboxIcon } from '@vuldetected/ui';
import Link from 'next/link';
import { desc, domains, eq, findings, scans } from '@vuldetected/db';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';
import { getSeverityVariant } from '@/lib/severity/classify';

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
 */
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
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

  const [scanList, findingList] = await Promise.all([
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
    db()
      .select({
        id: findings.id,
        severity: findings.severity,
        checkName: findings.checkName,
        title: findings.title,
        affectedUrl: findings.affectedUrl,
        scanId: findings.scanId,
      })
      .from(findings)
      .innerJoin(scans, eq(findings.scanId, scans.id))
      .innerJoin(domains, eq(scans.domainId, domains.id))
      .where(eq(domains.userId, userId))
      .orderBy(desc(findings.createdAt))
      .limit(50),
  ]);

  const severityCounts = findingList.reduce(
    (acc, f) => {
      const key = f.severity === 'unclassified' ? 'unclassified' : f.severity;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

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

      {/*
        Sprint 1 produced no scanner, so there is genuinely nothing to show. The
        empty state says so instead of rendering a fake-zero dashboard, because a
        fabricated "0 critical findings" would be indistinguishable from a real one.
      */}
      <Card>
        <CardHeader>
          <CardTitle>{t('severityBreakdown')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {['critical', 'high', 'medium', 'low', 'info', 'unclassified'].map((sev) => (
              <Badge key={sev} variant={getSeverityVariant(sev)}>
                {sev === 'unclassified'
                  ? t('findings.severity.unclassified')
                  : t.has(`findings.severity.${sev}` as never)
                    ? t(`findings.severity.${sev}` as never)
                    : sev}{' '}
                {severityCounts[sev] || 0}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('scans')}</CardTitle>
          <CardDescription>{t('list.yourScans.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {scanList.length === 0 ? (
            <EmptyState title={t('findings.title')} description={t('findings.description')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('list.table.target')}</TableHead>
                  <TableHead>{t('list.table.status')}</TableHead>
                  <TableHead>{t('list.table.created')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanList.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{scan.targetUrl}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{scan.status}</Badge>
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
                        <Link href={`/scans/${scan.id}`}>{t('list.table.viewDetails')}</Link>
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
          <CardDescription>{t('detail.findings.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {findingList.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-4 w-4" />}
              title={t('findings.title')}
              description={t('findings.description')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('findings.table.severity')}</TableHead>
                  <TableHead>{t('findings.table.finding')}</TableHead>
                  <TableHead>{t('findings.table.affectedUrl')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findingList.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell>
                      <Badge variant={getSeverityVariant(finding.severity)}>
                        {finding.severity === 'unclassified'
                          ? t('findings.severity.unclassified')
                          : t.has(`findings.severity.${finding.severity}` as never)
                            ? t(`findings.severity.${finding.severity}` as never)
                            : finding.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{finding.title}</span>
                    </TableCell>
                    <TableCell>
                      <span className="break-all font-mono text-xs">{finding.affectedUrl}</span>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/scans/${finding.scanId}/findings/${finding.id}`}>
                          {t('findings.viewDetails')}
                        </Link>
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
