'use client';

import { landingContent } from '@/content/landing.es';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function SecurityTrust() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="py-20 bg-surface">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-12 text-center sm:text-4xl">{landingContent.security.title}</h2>
        <div className="relative flex flex-col items-center">
          <motion.div
            className="mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-brand/20 ring-2 ring-brand"
            animate={prefersReducedMotion ? {} : { scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-5xl">🛡️</span>
          </motion.div>
          <div className="grid gap-4 md:grid-cols-2 max-w-2xl">
            {landingContent.security.guarantees.map((guarantee, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-surface-raised p-4 ring-1 ring-border">
                <span className="text-brand">✓</span>
                <span className="text-sm">{guarantee.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
