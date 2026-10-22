import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/features/auth/login-form';
import { getServerSession } from '@/features/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');

  return { title: t('login.title') };
}

export default async function LoginPage() {
  const t = await getTranslations('auth');

  // An authenticated visitor has no reason to see this form, and letting them
  // submit it would reset their session for no gain.
  const session = await getServerSession();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
