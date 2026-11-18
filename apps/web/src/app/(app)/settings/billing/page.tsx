import type { SubscriptionPlan } from '@vuldetected/db';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from '@vuldetected/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireUser } from '@/features/auth/session';
import { CancelSubscriptionButton, CheckoutButton } from '@/features/billing/billing-controls';
import { formatProductDateTime } from '@/lib/format/datetime';
import { readPlanUsage } from '@/lib/plan-limits';
import { getPaymentProvider } from '@/lib/payments/provider';
import { readBillingSnapshot } from '@/lib/payments/subscriptions';
import { PLAN_CATALOG } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing');

  return { title: t('pageTitle') };
}

const PLAN_ORDER: readonly SubscriptionPlan[] = ['free', 'pro', 'business'];

/**
 * Billing (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHAT THIS SCREEN IS HONEST ABOUT
 *
 * Three things a billing screen usually fakes, and this one does not:
 *
 *   1. **The price.** Pro and Business show `[COMPLETAR: precios definitivos]`
 *      because no price has been agreed. Printing a plausible number would turn
 *      an open decision into a claim.
 *   2. **The charge.** The demo banner is not a footnote — it is a warning
 *      variant alert at the top, and the simulated provider is the only one that
 *      exists.
 *   3. **The state.** Everything rendered here is read from `users` and
 *      `checkout_sessions`. If the webhook never arrived, the plan still says
 *      Free, because that is the truth.
 */
export default async function BillingPage() {
  const t = await getTranslations('billing');
  const { userId } = await requireUser();

  const provider = getPaymentProvider();
  const [snapshot, usage] = await Promise.all([
    readBillingSnapshot(userId),
    readPlanUsage(userId),
  ]);

  const currentPlan = PLAN_CATALOG[snapshot.plan];
  const canBuy = provider !== null;

  return (
    <Container className="flex max-w-5xl flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
          {provider !== null && <Badge variant="neutral">{t('demoBadge')}</Badge>}
        </div>
        <p className="text-text-muted">{t('pageDescription')}</p>
      </div>

      {provider !== null ? (
        <Alert
          variant="warning"
          title={t('demoNoticeTitle')}
          description={t('demoNoticeDescription')}
        />
      ) : (
        <Alert variant="info" title={t('notConfiguredTitle')} description={t('notConfiguredDescription')} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('current.title')}</CardTitle>
          <CardDescription>{t('current.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">{t('current.plan')}</dt>
              <dd className="text-lg font-semibold">{currentPlan.name}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">
                {t('current.status')}
              </dt>
              <dd className="text-lg font-semibold">{t(`status.${snapshot.status}`)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">
                {t('current.periodEnd')}
              </dt>
              <dd>{formatProductDateTime(snapshot.periodEnd?.toISOString() ?? null)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">
                {t('current.lastCheckout')}
              </dt>
              <dd>
                {snapshot.lastCheckout === null
                  ? t('current.noCheckout')
                  : t('current.checkoutSummary', {
                      plan: PLAN_CATALOG[snapshot.lastCheckout.plan].name,
                      status: t(`checkoutStatus.${snapshot.lastCheckout.status}`),
                    })}
              </dd>
            </div>
          </dl>

          {snapshot.cancelAtPeriodEnd && (
            <Alert
              variant="info"
              title={t('current.cancellationScheduledTitle')}
              description={t('current.cancellationScheduledDescription')}
            />
          )}

          {snapshot.plan !== 'free' && !snapshot.cancelAtPeriodEnd && (
            <div>
              <CancelSubscriptionButton disabled={!canBuy} />
            </div>
          )}

          <p className="text-xs text-text-muted">
            {t('current.appliedEvents', { count: snapshot.appliedEvents })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('usage.title')}</CardTitle>
          <CardDescription>{t('usage.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">
                {t('usage.domains')}
              </dt>
              <dd className="font-medium">
                {usage.domains} / {currentPlan.maxDomains}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">
                {t('usage.scansThisMonth')}
              </dt>
              <dd className="font-medium">
                {usage.scansThisMonth} /{' '}
                {currentPlan.monthlyScans === null ? t('usage.unlimited') : currentPlan.monthlyScans}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">
                {t('usage.activeScans')}
              </dt>
              <dd className="font-medium">
                {usage.activeScans} / {currentPlan.concurrentScans}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-muted">
                {t('usage.schedules')}
              </dt>
              <dd className="font-medium">
                {usage.schedules} / {currentPlan.maxSchedules}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLAN_CATALOG[planId];
          const isCurrent = planId === snapshot.plan;
          const isPaid = planId !== 'free';

          return (
            <Card key={planId} className={isCurrent ? 'border-brand' : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{plan.name}</CardTitle>
                  {isCurrent && <Badge variant="info">{t('plans.currentBadge')}</Badge>}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-2xl font-bold">
                  {isPaid ? t('plans.pricePending') : t('plans.freePrice')}
                </p>

                <ul className="flex flex-col gap-1 text-sm text-text-muted">
                  <li>{t('plans.domains', { count: plan.maxDomains })}</li>
                  <li>
                    {plan.monthlyScans === null
                      ? t('plans.unlimitedScans')
                      : t('plans.scans', { count: plan.monthlyScans })}
                  </li>
                  <li>{t('plans.concurrent', { count: plan.concurrentScans })}</li>
                  <li>{t('plans.schedules', { count: plan.maxSchedules })}</li>
                </ul>

                {isPaid ? (
                  <CheckoutButton
                    plan={planId}
                    label={
                      isCurrent ? t('plans.currentBadge') : t('plans.changeTo', { plan: plan.name })
                    }
                    current={isCurrent}
                    disabled={!canBuy || isCurrent}
                  />
                ) : (
                  <p className="text-xs text-text-muted">{t('plans.freeHint')}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Container>
  );
}
