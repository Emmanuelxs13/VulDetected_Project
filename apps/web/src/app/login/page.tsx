import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vuldetected/ui';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/features/auth/login-form';
import { getServerSession } from '@/features/auth/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
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
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use the email and password you registered with.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
