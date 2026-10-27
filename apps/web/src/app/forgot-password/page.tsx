import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';

import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');

  return { title: t('forgotPassword.title') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('forgotPassword.title')}</CardTitle>
          <CardDescription>{t('forgotPassword.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
