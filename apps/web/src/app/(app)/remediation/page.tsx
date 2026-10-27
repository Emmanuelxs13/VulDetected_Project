import type { Metadata } from 'next';
import { and, domains, eq, findings, scans, sql } from '@vuldetected/db';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
} from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';
import { getRemediation, type RemediationEntry } from '@/lib/remediation/registry';
import { SEVERITY_ORDER } from '@/lib/severity/classify';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('remediation');

  return { title: t('title') };
}

/** Most severe severity a rule can produce, used to order the guides worst-first. */
function ruleWeight(entry: RemediationEntry): number {
  return Math.min(
    ...entry.severities.map((severity) =>
      SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]),
    ),
  );
}

/**
 * Remediation guides, driven by the findings the caller actually has open.
 *
 * ## WHY THIS IS NOT A STATIC LIBRARY PAGE
 *
 * A catalogue of every guide we wrote is a documentation site; it does not tell
 * the reader where to start. The page lists only the rules behind their own open
 * findings, worst first, with the number of open findings for each — so the
 * first card is the next thing to fix, not an alphabetical entry.
 *
 * ## WHY A RULE WITH NO GUIDE IS STILL LISTED
 *
 * Silently dropping it would make a gap in our own registry look like a clean
 * result. The entry is shown as "no guide yet" instead, which is the honest
 * state and the one that gets us a bug report.
 */
export default async function RemediationPage() {
  const t = await getTranslations('remediation');
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

  const openByCheck = await db()
    .select({ checkName: findings.checkName, total: sql<number>`count(*)::int` })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(domains.userId, userId), eq(findings.status, 'open')))
    .groupBy(findings.checkName);

  const withGuide = openByCheck
    .map((row) => ({ ...row, entry: getRemediation(row.checkName) }))
    .filter((row): row is typeof row & { entry: RemediationEntry } => row.entry !== undefined)
    .sort((a, b) => ruleWeight(a.entry) - ruleWeight(b.entry) || b.total - a.total);

  const withoutGuide = openByCheck.filter((row) => getRemediation(row.checkName) === undefined);

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>

      {withGuide.length === 0 && withoutGuide.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title={t('empty.title')} description={t('empty.description')} />
          </CardContent>
        </Card>
      ) : null}

      {withGuide.map(({ checkName, total, entry }) => (
        <Card key={checkName}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{entry.developerGuide.title}</CardTitle>
              <Badge variant="neutral">{t('openFindings', { count: total })}</Badge>
              <span className="font-mono text-xs text-text-muted">{checkName}</span>
            </div>
            <CardDescription>{entry.businessGuide.title}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {tScan('findings.detail.remediation.developer')}
              </h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {entry.developerGuide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {entry.developerGuide.notes?.map((note) => (
                <p key={note} className="text-xs text-text-muted">
                  {note}
                </p>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {tScan('findings.detail.remediation.sysadmin')}
              </h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {entry.sysadminGuide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {tScan('findings.detail.remediation.business')}
              </h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {entry.businessGuide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">
                {tScan('findings.detail.remediation.codeFixes')}
              </h3>
              {entry.codeFixes.map((fix) => (
                <div key={`${fix.language}-${fix.label}`} className="flex flex-col gap-1">
                  <div className="text-xs font-medium">
                    {fix.label} · {fix.language}
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-surface-raised p-3 text-xs">
                    <code>{fix.code}</code>
                  </pre>
                </div>
              ))}
            </section>
          </CardContent>
        </Card>
      ))}

      {withoutGuide.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('noGuide.title')}</CardTitle>
            <CardDescription>{t('noGuide.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2 text-xs">
              {withoutGuide.map((row) => (
                <li key={row.checkName} className="font-mono">
                  {row.checkName} ({row.total})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}
