'use client';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
} from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import {
  demoCheckoutAction,
} from './demo-checkout-actions';
import { initialDemoCheckoutState, type DemoCheckoutState } from './demo-checkout-types';

export interface DemoCheckoutFormProps {
  checkoutId: string;
  planName: string;
  approvedCard: string;
  declinedCard: string;
}

function resultVariant(state: DemoCheckoutState): 'info' | 'success' | 'warning' | 'critical' {
  if (state.status === 'error') return 'critical';
  if (state.outcome === 'applied') return 'success';
  if (state.outcome === 'duplicate') return 'info';
  return 'warning';
}

/**
 * The simulated hosted payment page's form (Sprint 2, HU-02b; ADR 0019).
 *
 * The three controls map one-to-one onto the three things a real webhook has to
 * survive, and each is labelled with what it proves:
 *
 *   - pay with an approved or a declined test card → the happy and the sad path;
 *   - resend the same event → deduplication by event id;
 *   - send a decline stamped in the past → out-of-order tolerance.
 *
 * The result banner reports the webhook's own answer (`applied`, `duplicate`,
 * `stale`), so the demo shows the server's decision instead of a client-side
 * guess about what probably happened.
 */
export function DemoCheckoutForm({
  checkoutId,
  planName,
  approvedCard,
  declinedCard,
}: DemoCheckoutFormProps) {
  const t = useTranslations('billing.demoCheckout');
  const [state, formAction, pending] = useActionState(demoCheckoutAction, initialDemoCheckoutState);

  const message =
    state.status === 'done' && state.outcome !== undefined
      ? t(`outcome.${state.outcome}`)
      : state.status === 'error' && state.error !== undefined
        ? t(`error.${state.error}`, { status: state.httpStatus ?? 0 })
        : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('payTitle', { plan: planName })}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="checkoutId" value={checkoutId} />
            <input type="hidden" name="intent" value="pay" />

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium text-text">{t('cardLegend')}</legend>

              {[
                { value: approvedCard, label: t('approvedLabel'), hint: t('approvedHint') },
                { value: declinedCard, label: t('declinedLabel'), hint: t('declinedHint') },
              ].map((card, index) => (
                <label
                  key={card.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border border-border',
                    'bg-surface-raised p-3 text-sm transition-colors hover:border-border-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="card"
                    value={card.value}
                    defaultChecked={index === 0}
                    className="mt-1"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="font-medium">{card.label}</span>
                    <span className="font-mono text-xs text-text-muted">{card.value}</span>
                    <span className="text-xs text-text-muted">{card.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <Button type="submit" disabled={pending}>
              {pending ? t('paying') : t('payButton')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {message !== null && (
        <Alert
          variant={resultVariant(state)}
          title={state.status === 'error' ? t('errorTitle') : t('resultTitle')}
          description={message}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('resilienceTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">{t('resilienceDescription')}</p>

          <div className="flex flex-wrap gap-2">
            <form action={formAction}>
              <input type="hidden" name="checkoutId" value={checkoutId} />
              <input type="hidden" name="intent" value="replay" />
              <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                {t('replayButton')}
              </Button>
            </form>

            <form action={formAction}>
              <input type="hidden" name="checkoutId" value={checkoutId} />
              <input type="hidden" name="intent" value="out-of-order" />
              <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                {t('outOfOrderButton')}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
