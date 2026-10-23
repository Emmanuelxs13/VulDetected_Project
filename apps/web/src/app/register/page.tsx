import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vuldetected/ui';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { RegisterForm } from '@/features/auth/register-form';
import { getServerSession } from '@/features/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');

  return { title: t('register.title') };
}

export default async function RegisterPage() {
  const t = await getTranslations('auth');

  const session = await getServerSession();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('register.title')}</CardTitle>
          <CardDescription>{t('register.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </div>
  );
}
