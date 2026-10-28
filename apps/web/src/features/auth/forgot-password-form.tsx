'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { requestPasswordResetAction } from './password-reset';
import { MIN_PASSWORD_LENGTH } from './schema';

/**
 * Requests a reset link.
 *
 * On success it says "check your email" and nothing else — never "we sent you a
 * message", which would be a confirmation that the address is registered. The
 * same screen appears for an unknown address, and that is the point.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(requestPasswordResetAction, null);

  const translate = (key: string) => (t.has(key) ? t(key, { min: MIN_PASSWORD_LENGTH }) : key);

  if (state?.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert
          variant="success"
          title={t('forgotPassword.sent')}
          description={t('forgotPassword.sentDetail')}
        />
        <Link href="/login" className="text-sm font-medium text-brand underline underline-offset-2">
          {t('forgotPassword.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div aria-live="polite" aria-atomic="true">
        {state && !state.success ? <Alert variant="critical" title={translate(state.error)} /> : null}
      </div>

      <Field
        label={t('fields.email')}
        required
        error={
          state && !state.success && state.fieldErrors?.email
            ? translate(state.fieldErrors.email)
            : undefined
        }
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

      <SubmitButton />

      <p className="text-xs text-text-muted">
        <Link href="/login" className="font-medium text-brand underline underline-offset-2">
          {t('forgotPassword.backToLogin')}
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
      {pending ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
    </Button>
  );
}
