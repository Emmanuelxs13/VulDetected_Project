'use client';

import { landingContent } from '@/content/landing.es';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { Badge } from '@vuldetected/ui';

export function ProductPreview() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="py-20 bg-surface">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-12 text-center sm:text-4xl">{landingContent.preview.title}</h2>
        <div className="space-y-16">
          {landingContent.preview.blocks.map((block, i) => (
            <motion.div
              key={i}
              className={`grid gap-8 lg:grid-cols-2 items-center ${i % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 40 }}
              whileInView={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <Badge variant="unknown" className="mb-4">{block.label}</Badge>
                <h3 className="text-2xl font-bold mb-4">{block.title}</h3>
                <p className="text-lg text-text-muted">{block.description}</p>
              </div>
              <div className={`rounded-xl bg-surface-raised p-6 ring-1 ring-border ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                {i === 0 && (
                  <div className="rounded-lg border border-critical/50 bg-critical-tint p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-lg">⚠️</span>
                      <span className="font-semibold text-critical">Riesgo Alto</span>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-high">Alta: 3</span>
                      <span className="text-medium">Media: 5</span>
                      <span className="text-low">Baja: 8</span>
                    </div>
                  </div>
                )}
                {i === 1 && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-2 font-medium">Cross-Site Scripting (XSS)</div>
                      <p className="mb-3 text-sm text-text-muted">Explicación en lenguaje claro</p>
                      <div className="rounded bg-surface p-3 font-mono text-xs overflow-x-auto">
                        <code>&lt;script&gt;alert(&apos;XSS&apos;)&lt;/script&gt;</code>
                      </div>
                      <button className="mt-2 text-xs text-brand">Copiar</button>
                    </div>
                  </div>
                )}
                {i === 2 && (
                  <div className="h-32 bg-surface rounded flex items-end gap-2 p-4">
                    <div className="w-8 bg-critical h-16 rounded-t"></div>
                    <div className="w-8 bg-high h-12 rounded-t"></div>
                    <div className="w-8 bg-medium h-8 rounded-t"></div>
                    <div className="w-8 bg-low h-4 rounded-t"></div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
