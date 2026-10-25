'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@vuldetected/ui';
import { landingContent } from '@/content/landing.es';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function BenefitsTabs() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="beneficios" className="py-20 bg-surface">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-12 text-center sm:text-4xl">{landingContent.benefits.title}</h2>
        
        <Tabs defaultValue="dev" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            {landingContent.benefits.roles.map((role) => (
              <TabsTrigger key={role.id} value={role.id}>
                {role.name}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {landingContent.benefits.roles.map((role) => (
            <TabsContent key={role.id} value={role.id}>
              <motion.div
                className="grid gap-8 lg:grid-cols-2 items-center rounded-xl bg-surface-raised p-8 ring-1 ring-border"
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
                animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div>
                  <h3 className="text-2xl font-bold mb-4">{role.headline}</h3>
                  <ul className="space-y-3">
                    {role.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-brand mt-1">✓</span>
                        <span className="text-text-muted">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg bg-surface p-6 ring-1 ring-border">
                  <div className="mb-4 text-sm font-medium text-text-muted">Vista previa</div>
                  <div className="space-y-2">
                    <div className="h-3 bg-border rounded w-3/4"></div>
                    <div className="h-3 bg-border rounded w-1/2"></div>
                    <div className="h-3 bg-border rounded w-5/6"></div>
                  </div>
                </div>
              </motion.div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
