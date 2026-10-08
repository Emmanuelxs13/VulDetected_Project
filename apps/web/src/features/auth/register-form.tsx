'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import Link from 'next/link';
import { useActionState } from 'react';
// React 19 moved `useFormStatus` out of `react` and into `react-dom`.
import { useFormStatus } from 'react-dom';

import { registerAction } from './actions';
import { MIN_PASSWORD_LENGTH } from './schema';

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
 */
export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div aria-live="polite" aria-atomic="true">
        {state && !state.success ? <Alert variant="critical" title={state.error} /> : null}
      </div>

      <Field
        label="Name"
        // Optional, not required: email-only signup must not demand a name.
        // Demanding one measurably raises signup abandonment and an account does
        // not become more secure by having a name attached.
        description="Optional. Used to address you in the dashboard."
        error={state && !state.success ? state.fieldErrors?.name : undefined}
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
        label="Email"
        required
        error={state && !state.success ? state.fieldErrors?.email : undefined}
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
        label="Password"
        required
        description={`At least ${MIN_PASSWORD_LENGTH} characters. Length is what matters — capital letters, symbols and digits are not required.`}
        error={state && !state.success ? state.fieldErrors?.password : undefined}
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
            maxLength={128}
            required
          />
        )}
      </Field>

      <SubmitButton label="Create account" />

      <p className="text-xs text-text-muted">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-brand underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" fullWidth loading={pending}>
      {pending ? 'Creating…' : label}
    </Button>
  );
}
