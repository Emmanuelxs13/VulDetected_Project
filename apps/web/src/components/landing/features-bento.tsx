'use client';

import { Badge } from '@vuldetected/ui';
import { landingContent, featureFlags } from '@/content/landing.es';
import {
  IconDashboard,
  IconDomain,
  IconFindings,
  IconGuides,
  IconReport,
  IconScan,
  IconSchedule,
} from '@/components/icons';

const featureIcons: Record<string, typeof IconScan> = {
  scan: IconScan,
  domain: IconDomain,
  progress: IconDashboard,
  findings: IconFindings,
  report: IconReport,
  history: IconSchedule,
  guides: IconGuides,
  export: IconReport,
  schedule: IconSchedule,
  status: IconFindings,
};

export function FeaturesBento() {
  return (
    <section
      id="funcionalidades"
      aria-labelledby="features-heading"
      className="bg-surface py-20 sm:py-24"
    >
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand">
            Una plataforma, todo el recorrido
          </p>
          <h2
            id="features-heading"
            className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
          >
            {landingContent.features.title}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-text-muted sm:text-lg">
            {landingContent.features.intro}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {landingContent.features.items.map((item, i) => {
            const isComingSoon = item.flag && !featureFlags[item.flag as keyof typeof featureFlags];
            const FeatureIcon = featureIcons[item.icon] ?? IconScan;
            return (
              <div
                key={item.title}
                className={`group relative flex min-h-52 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 transition duration-200 hover:-translate-y-1 hover:border-brand/50 ${
                  i === 0 ? 'sm:col-span-2 lg:col-span-2' : ''
                } ${isComingSoon ? 'opacity-70' : ''}`}
              >
                <div className="mb-7 flex items-start justify-between gap-4">
                  <span className="inline-flex size-12 items-center justify-center rounded-xl bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-text-on-brand">
                    <FeatureIcon size={22} aria-hidden="true" />
                  </span>
                  <span className="pt-1 text-xs font-semibold tracking-[0.12em] text-text-subtle">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {isComingSoon && <Badge variant="unknown">Próximamente</Badge>}
                </div>
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="max-w-prose text-sm leading-6 text-text-muted">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
