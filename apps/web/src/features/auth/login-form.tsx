'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
// React 19 moved `useFormStatus` out of `react` and into `react-dom`.
import { useFormStatus } from 'react-dom';

import { signIn } from '@/lib/auth-client';

import { loginAction } from './actions';
import { MAX_PASSWORD_LENGTH } from './schema';

export function LoginForm() {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(loginAction, null);

  const translate = (key: string) => (t.has(key) ? t(key, { max: MAX_PASSWORD_LENGTH }) : key);
  const fieldError = (key: string | undefined) => (key ? translate(key) : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div aria-live="polite" aria-atomic="true">
        {state && !state.success ? (
          <Alert variant="critical" title={translate(state.error)} />
        ) : null}
      </div>

      <Field
        label={t('fields.email')}
        required
        error={state && !state.success ? fieldError(state.fieldErrors?.email) : undefined}
      >
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
          />
        )}
      </Field>

      <Field
        label={t('fields.password')}
        required
        error={state && !state.success ? fieldError(state.fieldErrors?.password) : undefined}
      >
        {(control) => (
          <Input
            {...control}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        )}
      </Field>

      <SubmitButton />

      <SocialButtons mode="login" />

      <p className="text-xs text-text-muted">
        {t('login.noAccount')}{' '}
        <Link href="/register" className="font-medium text-brand underline underline-offset-2">
          {t('login.createOne')}
        </Link>
      </p>
    </form>
  );
}

function SubmitButton() {
  const t = useTranslations('auth');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" fullWidth loading={pending}>
      {pending ? t('login.submitting') : t('login.submit')}
    </Button>
  );
}

function SocialButtons({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth');
  const hasGoogle = Boolean(process.env.NEXT_PUBLIC_GOOGLE_ENABLED);
  const hasGithub = Boolean(process.env.NEXT_PUBLIC_GITHUB_ENABLED);
  if (!hasGoogle && !hasGithub) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface px-2 text-text-muted">{t('social.or')}</span>
        </div>
      </div>
      {hasGoogle ? (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => signIn.social({ provider: 'google', callbackURL: '/dashboard' })}
        >
          {mode === 'login' ? t('social.continueGoogle') : t('social.signUpGoogle')}
        </Button>
      ) : null}
      {hasGithub ? (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => signIn.social({ provider: 'github', callbackURL: '/dashboard' })}
        >
          {mode === 'login' ? t('social.continueGithub') : t('social.signUpGithub')}
        </Button>
      ) : null}
    </div>
  );
}
