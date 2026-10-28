import type { Metadata } from 'next';
import { and, domains, eq, findings, scans } from '@vuldetected/db';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from '@vuldetected/ui';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';
import { getRemediation } from '@/lib/remediation/registry';
import { classifyFinding, getSeverityVariant } from '@/lib/severity/classify';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scan');
  return { title: t('findings.detail.metadataTitle') };
}

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ scanId: string; findingId: string }>;
}) {
  const { scanId, findingId } = await params;
  const t = await getTranslations('scan');
  const session = await getServerSession();
  if (!session?.user) notFound();

  const rows = await db()
    .select({ finding: findings })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(
      and(eq(findings.id, findingId), eq(scans.id, scanId), eq(domains.userId, session.user.id)),
    )
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const finding = row.finding;
  const remediation = getRemediation(finding.checkName);
  // Classification is pure, so the rule that produced the stored severity can be
  // shown to the reader instead of asking them to trust a number.
  const classification = classifyFinding(
    finding.checkName,
    (finding.evidence ?? {}) as Record<string, unknown>,
    finding.title,
  );

  return (
    <Container size="default" className="flex flex-col gap-6 py-12">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{finding.title}</h1>
          <Badge variant={getSeverityVariant(finding.severity)}>
            {finding.severity === 'unclassified'
              ? t('findings.severity.unclassified')
              : finding.severity}
          </Badge>
        </div>
        <p className="text-sm text-text-muted">{finding.description}</p>
        <p className="text-xs font-mono text-text-muted">{finding.affectedUrl}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('findings.detail.evidence')}</CardTitle>
          <CardDescription>{t('findings.detail.evidenceDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="text-xs text-text-muted">
            {t('findings.rationale.rule')}:{' '}
            <span className="font-mono">{t(`findings.rationale.${classification.rationale}`)}</span>
          </div>
          <pre className="overflow-x-auto rounded-md bg-surface-raised p-3 text-xs">
            {JSON.stringify(finding.evidence, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {remediation ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('findings.detail.remediation.developer')}</CardTitle>
              <CardDescription>{remediation.developerGuide.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {remediation.developerGuide.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('findings.detail.remediation.sysadmin')}</CardTitle>
              <CardDescription>{remediation.sysadminGuide.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {remediation.sysadminGuide.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('findings.detail.remediation.business')}</CardTitle>
              <CardDescription>{remediation.businessGuide.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {remediation.businessGuide.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('findings.detail.remediation.codeFixes')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {remediation.codeFixes.map((fix, idx) => (
                <div key={idx} className="flex flex-col gap-2">
                  <div className="text-xs font-medium">
                    {fix.label} - {fix.language}
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-surface-raised p-3 text-xs">
                    <code>{fix.code}</code>
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </Container>
  );
}
