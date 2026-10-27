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
} from '@vuldetected/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { getServerSession } from '@/features/auth/session';
import { FindingsList } from '@/features/scans/components/findings-list';
import { FindingsPagination } from '@/features/scans/components/findings-pagination';
import { getSeverityCounts, listFindingsPage } from '@/features/scans/queries/findings-page';
import { SEVERITY_ORDER, getSeverityVariant } from '@/lib/severity/classify';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('findingsPage');

  return { title: t('title') };
}

/**
 * Every finding the caller owns, across all their domains.
 *
 * ## WHY THIS EXISTS INSTEAD OF A PER-SCAN LIST
 *
 * The per-scan view answers "what did this run find". A reader who wants to fix
 * things asks the opposite question: "what is open right now, worst first". Both
 * need the same rows, so this page reuses the same paged query and the same
 * table instead of a second implementation that could drift.
 *
 * ## WHY THE COUNTS AND THE ROWS DO NOT MATCH WHEN NOTHING IS FILTERED
 *
 * The filter counts only open findings, because that is the number the dashboard
 * light is built from. The table shows resolved and dismissed rows too, so the
 * reader can confirm their triage stuck. The description says so where they
 * could otherwise assume the numbers are broken.
 */
export default async function FindingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ severity?: string; cursor?: string }>;
}) {
  const t = await getTranslations('findingsPage');
  const tScan = await getTranslations('scan');
  const query = (await searchParams) ?? {};

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

  const [page, severityTotals] = await Promise.all([
    listFindingsPage({
      ownerUserId: userId,
      severity: query.severity,
      cursor: query.cursor,
    }),
    getSeverityCounts(userId),
  ]);

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('list.title')}</CardTitle>
          <CardDescription>{t('list.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant={!query.severity ? 'secondary' : 'ghost'} size="sm">
              <Link href="/findings">
                {tScan('findings.filter.all')} ({severityTotals.total})
              </Link>
            </Button>
            {SEVERITY_ORDER.map((severity) => (
              <Button
                asChild
                key={severity}
                variant={query.severity === severity ? 'secondary' : 'ghost'}
                size="sm"
              >
                <Link href={`/findings?severity=${severity}`}>
                  <Badge variant={getSeverityVariant(severity)}>
                    {tScan(`findings.severity.${severity}`)} ({severityTotals.counts[severity]})
                  </Badge>
                </Link>
              </Button>
            ))}
          </div>

          <FindingsList
            findings={page.rows}
            emptyTitle={t('empty.title')}
            emptyDescription={t('empty.description')}
          />

          <FindingsPagination
            basePath="/findings"
            params={{ severity: query.severity }}
            nextCursor={page.nextCursor}
            isPaged={Boolean(query.cursor)}
          />
        </CardContent>
      </Card>
    </Container>
  );
}
