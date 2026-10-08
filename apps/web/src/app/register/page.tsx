import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vuldetected/ui';
import { redirect } from 'next/navigation';

import { RegisterForm } from '@/features/auth/register-form';
import { getServerSession } from '@/features/auth/session';

export const metadata: Metadata = { title: 'Create an account' };

export default async function RegisterPage() {
  const session = await getServerSession();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Email verification is disabled in Sprint 1, so you can sign in straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </div>
  );
}
