'use client';

import { Badge } from '@vuldetected/ui';
import { landingContent, featureFlags } from '@/content/landing.es';

export function FeaturesBento() {
  return (
    <section id="funcionalidades" className="py-20">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-12 text-center sm:text-4xl">{landingContent.features.title}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {landingContent.features.items.map((item, i) => {
            const isComingSoon = item.flag && !featureFlags[item.flag as keyof typeof featureFlags];
            return (
              <div
                key={i}
                className={`rounded-xl p-6 ring-1 ring-border transition-all hover:ring-brand/50 ${
                  i === 0 || i === 4 ? 'md:col-span-2' : ''
                } ${isComingSoon ? 'opacity-60' : ''}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-2xl">🔍</div>
                  {isComingSoon && <Badge variant="unknown">Próximamente</Badge>}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm text-text-muted">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
