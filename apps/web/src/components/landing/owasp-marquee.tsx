'use client';

import { landingContent } from '@/content/landing.es';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function OwaspMarquee() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="py-20">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-6 text-center sm:text-4xl">{landingContent.owasp.title}</h2>
        <p className="mb-12 text-center text-lg text-text-muted max-w-3xl mx-auto">{landingContent.owasp.text}</p>
        
        <div className="relative overflow-hidden">
          <div className={`flex gap-4 ${prefersReducedMotion ? '' : 'animate-marquee'}`}>
            {[...landingContent.owasp.categories, ...landingContent.owasp.categories].map((cat, i) => (
              <div
                key={i}
                className="flex-shrink-0 rounded-lg bg-surface px-6 py-3 ring-1 ring-border whitespace-nowrap"
              >
                {cat}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
