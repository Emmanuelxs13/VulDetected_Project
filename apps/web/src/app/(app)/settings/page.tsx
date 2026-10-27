import type { Metadata } from 'next';
import { and, desc, domains, eq } from '@vuldetected/db';
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

import { requireUser } from '@/features/auth/session';
import { CredentialsSection } from '@/features/credentials/components/credentials-section';
import { listActiveCredentials } from '@/lib/credentials/store';
import { db } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');

  return { title: t('title') };
}

/**
 * Settings.
 *
 * Every section reads real state: the profile comes from the session's user row,
 * the domain list from the verified domains the account proved, and the
 * credential list from the sealed rows. None of them renders a control that does
 * nothing — a button that cannot act is indistinguishable from a broken feature.
 *
 * There is deliberately no "edit profile" form yet. The fields it would write
 * (name, email) belong to the auth provider's own update path, and half of that
 * flow — a form that saves a name but leaves the session stale — is worse than
 * showing the truth read-only.
 */
export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const credentialsT = await getTranslations('credentials');
  const { session, userId } = await requireUser();

  const [verifiedDomains, credentials] = await Promise.all([
    db()
      .select({
        id: domains.id,
        hostname: domains.normalizedHostname,
        verifiedAt: domains.verifiedAt,
      })
      .from(domains)
      .where(and(eq(domains.userId, userId), eq(domains.verified, true)))
      .orderBy(desc(domains.createdAt)),
    listActiveCredentials(userId),
  ]);

  const user = session.user;

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{credentialsT('pageTitle')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-text-muted">{t('profile.name')}</dt>
              <dd className="text-sm">{user.name?.trim() ? user.name : t('profile.noName')}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-text-muted">{t('profile.email')}</dt>
              <dd className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs">{user.email}</span>
                <Badge variant={user.emailVerified ? 'low' : 'medium'}>
                  {user.emailVerified ? t('profile.emailVerified') : t('profile.emailNotVerified')}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('domains.title')}</CardTitle>
          <CardDescription>{t('domains.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {verifiedDomains.length === 0 ? (
            <EmptyState
              title={t('domains.empty.title')}
              description={t('domains.empty.description')}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {verifiedDomains.map((domain) => (
                <li
                  key={domain.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="font-mono text-xs">{domain.hostname}</span>
                  <span className="tabular text-xs text-text-muted">
                    {domain.verifiedAt
                      ? t('domains.verifiedAt', {
                          date: domain.verifiedAt.toISOString().slice(0, 10),
                        })
                      : t('domains.verified')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CredentialsSection verifiedDomains={verifiedDomains} credentials={credentials} />
    </Container>
  );
}
