import type { SubscriptionPlan, SubscriptionStatus } from '@vuldetected/db';

/**
 * Plan catalogue.
 *
 * ## WHY THE FREE PLAN CAN USE EVERY FEATURE
 *
 * The product is sold on the evidence it produces. A trial that hides the PDF,
 * the alert or the scheduled scan does not let the buyer evaluate the thing they
 * are being asked to pay for, and it turns the first real security finding into a
 * paywall instead of a demonstration. Every plan therefore runs the same ten
 * checks, exports the same PDFs and sends the same critical alerts.
 *
 * What a plan actually buys is capacity. That is also the only thing this module
 * models: numbers, no feature flags. A `pdfExport: false` field would be a second
 * source of truth for permission, and the two would eventually disagree.
 *
 * ## WHERE THE LIMITS ARE ENFORCED
 *
 * Never in the UI. `@/lib/plan-limits` reads these values and the server actions
 * call it before writing: a limit that only exists in a disabled button is a
 * suggestion, not a limit.
 */
export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  description: string;
  /** Verified domains the account may own at the same time. */
  maxDomains: number;
  /** Scans per calendar month (UTC). `null` means no cap. */
  monthlyScans: number | null;
  /** Scans that may be queued or running at the same time. */
  concurrentScans: number;
  /** Recurring schedules the account may keep enabled. */
  maxSchedules: number;
}

export const PLAN_CATALOG: Record<SubscriptionPlan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Everything the product does, with room for a handful of sites.',
    // Generous on purpose: the evaluation target is "run the whole product on
    // Free", and three domains with two concurrent scans is enough to do it
    // while still being a real ceiling.
    maxDomains: 3,
    monthlyScans: 60,
    concurrentScans: 2,
    maxSchedules: 1,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For developers who need recurring security visibility.',
    maxDomains: 20,
    monthlyScans: 400,
    concurrentScans: 5,
    maxSchedules: 10,
  },
  business: {
    id: 'business',
    name: 'Business',
    description: 'For teams operating multiple protected applications.',
    maxDomains: 100,
    monthlyScans: null,
    concurrentScans: 15,
    maxSchedules: 50,
  },
};

export function getPlanDefinition(plan: SubscriptionPlan): PlanDefinition {
  return PLAN_CATALOG[plan] ?? PLAN_CATALOG.free;
}

export function subscriptionLabel(plan: SubscriptionPlan, status: SubscriptionStatus): string {
  return `${getPlanDefinition(plan).name} · ${status}`;
}
