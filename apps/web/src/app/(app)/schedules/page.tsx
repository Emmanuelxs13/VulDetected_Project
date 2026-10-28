import type { Metadata } from 'next';
import { and, desc, domains, eq } from '@vuldetected/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';

import { requireUser } from '@/features/auth/session';
import { NewScheduleForm } from '@/features/scans/components/new-schedule-form';
import { SchedulesList } from '@/features/scans/components/schedules-list';
import { listSchedulesAction } from '@/features/scans/schedule-actions';
import { db } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scan');

  return { title: t('schedules.title') };
}

/**
 * Scheduled scans.
 *
 * ## WHY THIS PAGE OWNS THE SCHEDULE LIST, NOT THE SCANS PAGE
 *
 * The schedules used to live inside `/scans` next to the scan history, and this
 * route was a disabled button that said "coming soon". Two places claiming the
 * same feature is how one of them rots. The list, the create form and the
 * pause/resume/delete controls now live here, backed by the same actions the
 * scans page used; `/scans` is the scan history and the ownership flow.
 *
 * ## WHY THE LIST IS LOADED THROUGH THE ACTION
 *
 * `listSchedulesAction` is the access-controlled reader: it scopes on the caller
 * in the WHERE clause. Reading the table directly here would mean a second
 * implementation of that scoping, and the two would eventually disagree.
 */
export default async function SchedulesPage() {
  const t = await getTranslations('scan');
  const { userId } = await requireUser();

  const [verifiedDomains, schedulesResult] = await Promise.all([
    db()
      .select({ id: domains.id, hostname: domains.normalizedHostname })
      .from(domains)
      .where(and(eq(domains.userId, userId), eq(domains.verified, true)))
      .orderBy(desc(domains.createdAt)),
    listSchedulesAction(),
  ]);

  if (!schedulesResult.success) {
    throw new Error(schedulesResult.error);
  }

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('schedules.title')}</h1>
        <p className="text-text-muted">{t('schedules.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('schedules.new')}</CardTitle>
          <CardDescription>{t('schedules.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <NewScheduleForm verifiedHosts={verifiedDomains} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('schedules.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SchedulesList schedules={schedulesResult.data} />
        </CardContent>
      </Card>
    </Container>
  );
}
