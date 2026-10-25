'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vuldetected/ui';
import { landingContent, featureFlags } from '@/content/landing.es';
import Link from 'next/link';

export function PricingSection() {
  return (
    <section id="planes" className="py-20">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-12 text-center sm:text-4xl">{landingContent.pricing.title}</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {landingContent.pricing.plans.map((plan, i) => {
            const isFree = plan.name === 'Gratis';
            const isComingSoon = !isFree && !featureFlags.stripe;
            return (
              <Card key={i} className={i === 1 ? 'ring-2 ring-brand' : ''}>
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="text-3xl font-bold">{plan.price}</div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-text-muted">
                        <span className="text-brand">•</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {isFree ? (
                    <Button asChild className="w-full" variant="primary">
                      <Link href="/register">{plan.cta}</Link>
                    </Button>
                  ) : isComingSoon ? (
                    <Button className="w-full" variant="secondary" disabled>
                      {plan.cta}
                    </Button>
                  ) : (
                    <Button className="w-full" variant="primary">
                      {plan.cta}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
