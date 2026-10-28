'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { resetPasswordAction } from './password-reset';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './schema';

/**
 * Sets a new password from a reset token.
 *
 * The token arrives in the URL, is rendered into a hidden field, and never
 * appears in the page text: a visible token is a token a shoulder-surfer or a
 * screenshot can steal. It is also the one field here that the browser must not
 * cache — the form is submitted once and the action redirects on success.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(resetPasswordAction, null);

  const translate = (key: string) =>
    t.has(key) ? t(key, { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH }) : key;
  const fieldError = (key: string | undefined) => (key ? translate(key) : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />

      <div aria-live="polite" aria-atomic="true">
        {state && !state.success ? (
          <Alert variant="critical" title={translate(state.error)} />
        ) : null}
      </div>

      <Field
        label={t('fields.password')}
        required
        description={t('resetPassword.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        error={state && !state.success ? fieldError(state.fieldErrors?.password) : undefined}
      >
        {(control) => (
          <Input
            {...control}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        )}
      </Field>

      <Field
        label={t('resetPassword.confirmLabel')}
        required
        error={state && !state.success ? fieldError(state.fieldErrors?.confirmPassword) : undefined}
      >
        {(control) => (
          <Input {...control} name="confirmPassword" type="password" autoComplete="new-password" required />
        )}
      </Field>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const t = useTranslations('auth');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" fullWidth loading={pending}>
      {pending ? t('resetPassword.submitting') : t('resetPassword.submit')}
    </Button>
  );
}
