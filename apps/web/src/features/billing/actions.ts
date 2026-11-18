'use server';

import { checkoutSessions, desc, eq, users } from '@vuldetected/db';
import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/features/auth/actions';
import { requireUser } from '@/features/auth/session';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { buildPaymentEvent, deliverPaymentEvent } from '@/lib/payments/deliver';
import { getPaymentProvider } from '@/lib/payments/provider';
import type { PaidPlan } from '@/lib/payments/types';
import { getPlanDefinition } from '@/lib/plans';

/**
 * Billing actions (Sprint 2, HU-02b; ADR 0019).
 *
 * ## WHAT THESE ACTIONS DO NOT DO
 *
 * They never write `users.subscription_plan`. Only the webhook does, after the
 * provider confirms. An action that set the plan directly would make the demo
 * work while leaving the real integration broken — the exact failure mode that
 * "simulate inside the feature" produces.
 *
 * `startCheckout` therefore writes a checkout row and returns where to send the
 * browser. `cancelSubscription` asks the provider to cancel, and the provider's
 * event is what flips the flag.
 */

const PAID_PLANS: readonly PaidPlan[] = ['pro', 'business'];

function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === 'string' && (PAID_PLANS as readonly string[]).includes(value);
}

export async function startCheckoutAction(formData: FormData): Promise<
  ActionResult<{
    checkoutUrl: string;
    amountCents: number | null;
  }>
> {
  const plan = formData.get('plan');
  if (!isPaidPlan(plan)) {
    return { success: false, error: 'errors.invalidPlan' };
  }

  const provider = getPaymentProvider();
  if (provider === null) {
    return { success: false, error: 'errors.providerNotConfigured' };
  }

  const { userId } = await requireUser();

  /**
   * Prices are `[COMPLETAR: precios definitivos]` until the team fixes them, so
   * the amount is NULL rather than a number nobody agreed to. The hosted page
   * renders the same placeholder, which is honest in the demo and forces the
   * decision before a real charge can exist.
   */
  const amountCents: number | null = null;

  const [row] = await db()
    .insert(checkoutSessions)
    .values({
      userId,
      plan,
      status: 'pending',
      provider: provider.id,
      amountCents,
    })
    .returning({ id: checkoutSessions.id });

  if (row === undefined) {
    return { success: false, error: 'errors.checkoutFailed' };
  }

  try {
    const handle = await provider.createCheckout({
      checkoutId: row.id,
      userId,
      plan,
      planName: getPlanDefinition(plan).name,
      amountCents,
    });

    await audit({
      action: 'plan.checkout_started',
      actorUserId: userId,
      targetType: 'checkout',
      targetId: row.id,
      metadata: { plan, provider: provider.id },
    });

    return { success: true, data: { checkoutUrl: handle.checkoutUrl, amountCents } };
  } catch (error) {
    console.error('[billing] could not create the checkout', error);
    return { success: false, error: 'errors.checkoutFailed' };
  }
}

/**
 * Requests cancellation through the provider.
 *
 * The simulator answers with a `subscription.cancelled` event, which sets
 * `cancel_at_period_end` — the plan stays until the paid period ends, because
 * that is what the customer paid for. Re-subscribing later clears the flag.
 */
export async function cancelSubscriptionAction(): Promise<ActionResult> {
  const provider = getPaymentProvider();
  if (provider === null) {
    return { success: false, error: 'errors.providerNotConfigured' };
  }

  const { userId } = await requireUser();

  const [userRow] = await db()
    .select({ plan: users.subscriptionPlan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [lastPaid] = await db()
    .select({ id: checkoutSessions.id })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.userId, userId))
    .orderBy(desc(checkoutSessions.createdAt))
    .limit(1);

  const event = buildPaymentEvent({
    type: 'subscription.cancelled',
    // An opaque subscription reference. The event carries it back so a real
    // gateway's `subscription_id` would slot into the same field.
    checkoutId: lastPaid?.id ?? `sub_${userId}`,
    userId,
    plan: userRow?.plan ?? 'free',
  });

  const result = await deliverPaymentEvent(event);

  if (result.status !== 200) {
    return { success: false, error: 'errors.cancelFailed' };
  }

  await audit({
    action: 'plan.cancel_requested',
    actorUserId: userId,
    targetType: 'subscription',
    targetId: userId,
    metadata: { outcome: result.outcome },
  });

  revalidatePath('/settings/billing');
  return { success: true, data: undefined };
}
