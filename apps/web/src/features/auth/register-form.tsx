'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
// React 19 moved `useFormStatus` out of `react` and into `react-dom'.
import { useFormStatus } from 'react-dom';

import { signIn } from '@/lib/auth-client';

import { registerAction } from './actions';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './schema';

/**
 * Registration form.
 *
 * ## THE COPY IS THE SECURITY DESIGN
 *
 * There is no "that email is already registered" message. Enumeration is
 * detected by differentiating that response from the successful one, so a form
 * that says it is an enumeration oracle, regardless of the intent behind it.
 *
 * The duplicate path therefore behaves identically: `registerAction` attempts a
 * sign-in with the same credentials and returns the same shape either way. See
 * `schema.ts` for the full reasoning.
 *
 * ## WHY THE ERROR IS AN ALERT AND NOT AN INLINE FIELD MESSAGE
 *
 * Inline under the field ("Email already taken") is the most natural UI for this
 * and it is exactly the leak. A form-level alert cannot be attributed to one
 * field, so it cannot become a per-field oracle.
 *
 * ## WHY THE ACTION RETURNS KEYS
 *
 * `actions.ts` and `schema.ts` run on the server, where the request locale is
 * available but a client component is not. They return `auth.*` message keys and
 * this form translates them, so validation and auth failures follow the language
 * switch like every other string on the page.
 */
export function RegisterForm() {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(registerAction, null);

  const translate = (key: string) =>
    t.has(key) ? t(key, { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH }) : key;
  const fieldError = (key: string | undefined) => (key ? translate(key) : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div aria-live="polite" aria-atomic="true">
        {state && !state.success ? (
          <Alert variant="critical" title={translate(state.error)} />
        ) : null}
      </div>

      <Field
        label={t('fields.name')}
        // Optional, not required: email-only signup must not demand a name.
        // Demanding one measurably raises signup abandonment and an account does
        // not become more secure by having a name attached.
        description={t('register.nameDescription')}
        error={state && !state.success ? fieldError(state.fieldErrors?.name) : undefined}
      >
        {(control) => (
          <Input
            {...control}
            name="name"
            type="text"
            autoComplete="name"
            maxLength={120}
            // `name` is NOT `required` here on purpose — the action's schema is the
            // authority, and an empty optional field must not block submission.
          />
        )}
      </Field>

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
        description={t('register.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        error={state && !state.success ? fieldError(state.fieldErrors?.password) : undefined}
      >
        {(control) => (
          <Input
            {...control}
            name="password"
            type="password"
            // `new-password` rather than `current-password`: this tells a password
            // manager NOT to autofill an existing credential here, which is
            // correct — the field is for choosing a new secret, not repeating one.
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        )}
      </Field>

      <SubmitButton />

      <SocialButtons mode="register" />

      <p className="text-xs text-text-muted">
        {t('register.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-brand underline underline-offset-2">
          {t('register.signIn')}
        </Link>
      </p>
    </form>
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

function SubmitButton() {
  const t = useTranslations('auth');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" fullWidth loading={pending}>
      {pending ? t('register.submitting') : t('register.submit')}
    </Button>
  );
}
