'use client';

import { Alert, Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { SubscriptionPlan } from '@vuldetected/db';

import { cancelSubscriptionAction, startCheckoutAction } from './actions';

/**
 * Billing controls (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHY "BUY" NAVIGATES INSTEAD OF CHANGING THE PLAN
 *
 * The button's only job is to create a checkout and send the browser to the
 * provider. The plan changes later, when the webhook arrives. A button that
 * flipped the plan locally would make the demo work and the integration wrong.
 *
 * ## WHY THE ERROR IS RENDERED, NOT TOASTED
 *
 * A failed checkout leaves the user on the same screen with the same choice. An
 * inline alert stays visible while they read it and retry; a toast disappears
 * exactly when the message becomes relevant.
 */

function useTranslatedError() {
  const t = useTranslations('billing');

  return (key: string | undefined) => {
    if (!key) return null;
    return t.has(key) ? t(key) : key;
  };
}

export function CheckoutButton({
  plan,
  label,
  current,
  disabled,
}: {
  plan: SubscriptionPlan;
  label: string;
  current: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('billing');
  const translate = useTranslatedError();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('plan', plan);
      const result = await startCheckoutAction(formData);

      if (!result.success) {
        setError(translate(result.error));
        return;
      }

      router.push(result.data.checkoutUrl);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={current ? 'secondary' : 'primary'}
        disabled={disabled || pending}
        loading={pending}
        onClick={onClick}
        fullWidth
      >
        {label}
      </Button>
      {error !== null && <Alert variant="critical" title={t('checkoutErrorTitle')} description={error} />}
    </div>
  );
}

export function CancelSubscriptionButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations('billing');
  const translate = useTranslatedError();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await cancelSubscriptionAction();
      if (!result.success) {
        setError(translate(result.error));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        loading={pending}
        onClick={onClick}
      >
        {t('cancelButton')}
      </Button>
      {error !== null && (
        <Alert variant="critical" title={t('cancelErrorTitle')} description={error} />
      )}
    </div>
  );
}
