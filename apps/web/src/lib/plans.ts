import type { SubscriptionPlan, SubscriptionStatus } from '@vuldetected/db';

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  description: string;
  monthlyScans: number | null;
  concurrentScans: number;
  scheduledScans: number;
  pdfExport: boolean;
  privateTargets: boolean;
  criticalAlerts: boolean;
}

export const PLAN_CATALOG: Record<SubscriptionPlan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'For trying the platform with a small monthly allowance.',
    monthlyScans: 5,
    concurrentScans: 1,
    scheduledScans: 0,
    pdfExport: false,
    privateTargets: false,
    criticalAlerts: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For developers who need recurring security visibility.',
    monthlyScans: 50,
    concurrentScans: 3,
    scheduledScans: 5,
    pdfExport: true,
    privateTargets: true,
    criticalAlerts: true,
  },
  business: {
    id: 'business',
    name: 'Business',
    description: 'For teams operating multiple protected applications.',
    monthlyScans: null,
    concurrentScans: 10,
    scheduledScans: 25,
    pdfExport: true,
    privateTargets: true,
    criticalAlerts: true,
  },
};

export function getPlanDefinition(plan: SubscriptionPlan): PlanDefinition {
  return PLAN_CATALOG[plan] ?? PLAN_CATALOG.free;
}

export function subscriptionLabel(plan: SubscriptionPlan, status: SubscriptionStatus): string {
  return `${getPlanDefinition(plan).name} · ${status}`;
}
