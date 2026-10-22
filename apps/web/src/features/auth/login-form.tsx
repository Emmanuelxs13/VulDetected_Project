'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
// React 19 moved `useFormStatus` out of `react` and into `react-dom`.
import { useFormStatus } from 'react-dom';

import { loginAction } from './actions';
import { MAX_PASSWORD_LENGTH } from './schema';

/**
 * Login form.
 *
 * Client Component, because Server Actions are invoked from the client with
 * `useActionState`. The action itself is `'use server'`-by-convention: importing a
 * `server-only` module into a client component is not possible — `actions.ts`
 * imports `next/headers`, which only exists on the server, so the boundary is
 * enforced by the runtime rather than by a comment.
 *
 * `useFormStatus` is read in a CHILD component, never in this one. React's
 * `isPending` is scoped to the `<form>` that owns the action, so reading it in the
 * parent reports the parent's state, not this form's — a mistake that produces a
 * submit button that never shows progress.
 *
 * ## WHY THE ACTION RETURNS KEYS
 *
 * `actions.ts` and `schema.ts` run on the server, where the request locale is
 * available but a client component is not. They return `auth.*` message keys and
 * this form translates them, so validation and auth failures follow the language
 * switch like every other string on the page.
 */
export function LoginForm() {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(loginAction, null);

  const translate = (key: string) => (t.has(key) ? t(key, { max: MAX_PASSWORD_LENGTH }) : key);
  const fieldError = (key: string | undefined) => (key ? translate(key) : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {/*
        `role="alert"` on the container plus `aria-live` means the failure is
        announced when it appears. A Server Action re-renders the tree, so the
        message is inserted rather than typed — without a live region a screen
        reader user gets no signal that anything happened at all.
      */}
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
            // The browser is the first validation layer. It is not the security
            // boundary — the action re-parses with the same Zod schema — but it
            // rejects an obviously malformed address without a round trip.
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
            // `current-password` tells the browser to offer the stored credential
            // and is what stops a password manager from offering to generate one.
            autoComplete="current-password"
            required
          />
        )}
      </Field>

      <SubmitButton />

      <p className="text-xs text-text-muted">
        {t('login.noAccount')}{' '}
        <Link href="/register" className="font-medium text-brand underline underline-offset-2">
          {t('login.createOne')}
        </Link>
      </p>
    </form>
  );
}

/** Isolated so `useFormStatus` binds to this form's pending state. */
function SubmitButton() {
  const t = useTranslations('auth');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" fullWidth loading={pending}>
      {pending ? t('login.submitting') : t('login.submit')}
    </Button>
  );
}
