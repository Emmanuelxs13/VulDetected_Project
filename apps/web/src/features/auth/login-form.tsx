'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
// React 19 moved `useFormStatus` out of `react` and into `react-dom'.
import { useFormStatus } from 'react-dom';

import { loginAction } from './actions';
import { MAX_PASSWORD_LENGTH } from './schema';
import type { SocialProviderId } from '@/lib/auth/social';

const SocialButtons = dynamic(() => import('./social-buttons').then((m) => m.SocialButtons), {
  ssr: false,
});

export function LoginForm({
  socialProviders = [],
  socialSimulated = false,
  socialErrorKey,
}: {
  socialProviders?: readonly SocialProviderId[];
  socialSimulated?: boolean;
  /**
   * Translation key for a social sign-in failure, already mapped from the
   * `?error=` code Better Auth appends on the redirect back to this page.
   */
  socialErrorKey?: string;
}) {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(loginAction, null);

  const translate = (key: string) => (t.has(key) ? t(key, { max: MAX_PASSWORD_LENGTH }) : key);
  const fieldError = (key: string | undefined) => (key ? translate(key) : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
        {socialErrorKey ? <Alert variant="critical" title={translate(socialErrorKey)} /> : null}
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

      <p className="-mt-2 text-xs">
        <Link
          href="/forgot-password"
          className="font-medium text-brand underline underline-offset-2"
        >
          {t('login.forgotPassword')}
        </Link>
      </p>

      <SubmitButton />

      <SocialButtons mode="login" providers={socialProviders} simulated={socialSimulated} />

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


