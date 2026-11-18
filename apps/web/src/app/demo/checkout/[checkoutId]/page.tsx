import { checkoutSessions, eq } from '@vuldetected/db';
import { Alert, Badge, Card, CardContent, Container } from '@vuldetected/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { DemoCheckoutForm } from '@/features/billing/demo-checkout-form';
import { db } from '@/lib/db';
import { demoModeEnabled } from '@/lib/demo-mode';
import { SIMULATED_TEST_CARDS } from '@/lib/payments/simulator';
import { getPlanDefinition } from '@/lib/plans';

/**
 * The simulated provider's hosted checkout page (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHY THIS PAGE IS NOT INSIDE `(app)`
 *
 * A hosted checkout page belongs to the payment provider, not to the product.
 * Rendering it inside the authenticated shell would hide the boundary the
 * architecture depends on: the browser leaves the app, the provider confirms the
 * payment out of band, and the app learns about it through the webhook. Keeping
 * this route outside the app layout is the cheapest honest representation of
 * that hop.
 *
 * ## WHY IT REFUSES TO EXIST WITHOUT `DEMO_MODE`
 *
 * A page that can hand out paid plans by clicking a button is a free-upgrade
 * endpoint. It 404s unless the demo profile is armed, and `lib/env.ts` refuses to
 * boot in production with the flag set.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing.demoCheckout');

  return { title: t('pageTitle') };
}

export default async function DemoCheckoutPage({
  params,
}: {
  params: Promise<{ checkoutId: string }>;
}) {
  if (!demoModeEnabled()) {
    notFound();
  }

  const { checkoutId } = await params;

  const [checkout] = await db()
    .select({
      id: checkoutSessions.id,
      plan: checkoutSessions.plan,
      status: checkoutSessions.status,
      amountCents: checkoutSessions.amountCents,
    })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, checkoutId))
    .limit(1);

  if (checkout === undefined) {
    notFound();
  }

  const t = await getTranslations('billing');
  const plan = getPlanDefinition(checkout.plan);

  return (
    <Container className="flex max-w-2xl flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{t('demoCheckout.pageTitle')}</h1>
          <Badge variant="neutral">{t('demoBadge')}</Badge>
        </div>
        <p className="text-text-muted">{t('demoCheckout.pageDescription')}</p>
      </div>

      <Alert
        variant="warning"
        title={t('demoNoticeTitle')}
        description={t('demoNoticeDescription')}
      />

      <Card>
        <CardContent className="grid gap-2 pt-6 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">{t('planLabel')}</span>
            <span className="font-medium">{plan.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">{t('priceLabel')}</span>
            <span className="font-medium">
              {checkout.amountCents === null
                ? t('pricePending')
                : `$${(checkout.amountCents / 100).toFixed(2)}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">{t('checkoutStatusLabel')}</span>
            <span className="font-medium">{t(`checkoutStatus.${checkout.status}`)}</span>
          </div>
        </CardContent>
      </Card>

      <DemoCheckoutForm
        checkoutId={checkout.id}
        planName={plan.name}
        approvedCard={SIMULATED_TEST_CARDS.approved.number}
        declinedCard={SIMULATED_TEST_CARDS.declined.number}
      />
    </Container>
  );
}
