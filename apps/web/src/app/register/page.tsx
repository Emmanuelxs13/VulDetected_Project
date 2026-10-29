import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

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
    <div className="min-h-screen bg-bg">
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden lg:flex flex-col justify-between p-10">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_80%_-20%,rgba(184,242,230,0.12),transparent)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,58,63,0.4)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,58,63,0.4)_1px,transparent_1px)] bg-[size:64px_64px]" />
          </div>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-sm font-bold text-text-on-brand">
              V
            </span>
            <span className="text-lg font-semibold">VulDetected</span>
          </Link>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight">
              Empieza a proteger tu aplicación
            </h1>
            <p className="max-w-md text-text-muted">
              Crea tu cuenta y ejecuta tu primer escaneo en minutos. Sin tarjeta de crédito.
            </p>
          </div>
          <p className="text-sm text-text-subtle">© {new Date().getFullYear()} VulDetected</p>
        </div>
        <div className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2 lg:hidden">
              <Link href="/" className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-sm font-bold text-text-on-brand">
                  V
                </span>
                <span className="text-lg font-semibold">VulDetected</span>
              </Link>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">{t('register.title')}</h2>
              <p className="text-text-muted">{t('register.description')}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-6 shadow-lg shadow-black/20">
              <RegisterForm />
            </div>
            <p className="text-center text-sm text-text-muted">
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" className="font-medium text-brand hover:underline">
                Iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
