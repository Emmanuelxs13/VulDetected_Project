'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vuldetected/ui';
import { landingContent, featureFlags } from '@/content/landing.es';
import Link from 'next/link';

export function PricingSection() {
  return (
    <section id="planes" className="py-20 sm:py-24">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand">
            Planes para cada etapa
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {landingContent.pricing.title}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-text-muted sm:text-lg">
            {landingContent.pricing.intro}
          </p>
        </div>
        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {landingContent.pricing.plans.map((plan, i) => {
            const isFree = plan.name === 'Gratis';
            const isComingSoon = !isFree && !featureFlags.stripe;
            return (
              <Card
                key={plan.name}
                className={`flex h-full flex-col overflow-hidden rounded-2xl ${
                  i === 1 ? 'border-brand ring-2 ring-brand' : ''
                }`}
              >
                <CardHeader className="gap-3 p-6 pb-5">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <p className="text-sm leading-6 text-text-muted">{plan.description}</p>
                  <div className="pt-2 text-2xl font-bold tracking-tight">{plan.price}</div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-6 px-6 pb-6">
                  <ul className="flex-1 space-y-3 border-t border-border pt-5">
                    {plan.features.map((feature, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-3 text-sm leading-6 text-text-muted"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand"
                        >
                          ✓
                        </span>
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
        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-6 text-text-muted">
          Los planes de pago estarán disponibles próximamente. Sus precios se publicarán antes de
          habilitar la contratación.
        </p>
      </div>
    </section>
  );
}
