import { and, domains, eq } from '@vuldetected/db';
import { Container } from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';

import { requireUser } from '@/features/auth/session';
import { CredentialsSection } from '@/features/credentials/components/credentials-section';
import { db } from '@/lib/db';
import { listActiveCredentials } from '@/lib/credentials/store';

/**
 * Settings.
 *
 * Everything on this page is real or absent: no card renders a button that does
 * nothing. The profile and domain sections are still to come, and a placeholder
 * that looks interactive would be indistinguishable from a broken feature — so
 * this page ships with the one section that works.
 */
export default async function SettingsPage() {
  const t = await getTranslations('credentials');
  const { userId } = await requireUser();

  const verifiedDomains = await db()
    .select({ id: domains.id, hostname: domains.normalizedHostname })
    .from(domains)
    .where(and(eq(domains.userId, userId), eq(domains.verified, true)));

  const credentials = await listActiveCredentials(userId);

  return (
    <Container className="flex flex-col gap-6 py-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>

      <CredentialsSection verifiedDomains={verifiedDomains} credentials={credentials} />
    </Container>
  );
}
