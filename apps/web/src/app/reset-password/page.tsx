import type { Metadata } from 'next';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');

  return { title: t('resetPassword.title') };
}

/**
 * Landing page for the link Better Auth mails.
 *
 * The library's own endpoint consumes the token and redirects here with
 * `?token=`, so a visitor without one either typed the URL or arrived from a
 * stale bookmark — both are told to request a fresh link rather than shown an
 * empty form that could only fail on submit.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const t = await getTranslations('auth');
  const params = await searchParams;
  const rawToken = params.token;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('resetPassword.title')}</CardTitle>
          <CardDescription>{t('resetPassword.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {token === '' ? (
            <div className="flex flex-col gap-4">
              <Alert
                variant="warning"
                title={t('resetPassword.missingToken')}
                description={t('resetPassword.missingTokenDetail')}
              />
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-brand underline underline-offset-2"
              >
                {t('resetPassword.requestNew')}
              </Link>
            </div>
          ) : (
            <ResetPasswordForm token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
