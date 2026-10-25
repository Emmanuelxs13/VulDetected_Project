'use client';

import { Button } from '@vuldetected/ui';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { landingContent } from '@/content/landing.es';
import { useEffect, useState } from 'react';

export function HeroAnimated() {
  const prefersReducedMotion = useReducedMotion();
  const [text, setText] = useState('');
  const fullText = 'https://ejemplo.com';

  useEffect(() => {
    if (prefersReducedMotion) {
      setText(fullText);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(109,92,231,0.15),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
          <div>
            <motion.h1
              className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {landingContent.hero.h1}
            </motion.h1>

            <motion.p
              className="mt-6 text-lg leading-relaxed text-text-muted sm:text-xl"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {landingContent.hero.subtitle}
            </motion.p>

            <motion.div
              className="mt-10 flex flex-col gap-4 sm:flex-row"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Button asChild size="lg" variant="primary">
                <Link href="/register">{landingContent.hero.ctaPrimary}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="#como-funciona">{landingContent.hero.ctaSecondary}</Link>
              </Button>
            </motion.div>

            <motion.p
              className="mt-4 text-sm text-text-muted"
              initial={prefersReducedMotion ? {} : { opacity: 0 }}
              animate={prefersReducedMotion ? {} : { opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {landingContent.hero.microtext}
            </motion.p>
          </div>

          <motion.div
            className="relative"
            initial={prefersReducedMotion ? {} : { opacity: 0, x: 40 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <div className="rounded-xl bg-surface/50 p-2 ring-1 ring-border">
              <div className="rounded-lg bg-surface-raised p-6 ring-1 ring-border">
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-critical" />
                  <div className="h-3 w-3 rounded-full bg-medium" />
                  <div className="h-3 w-3 rounded-full bg-low" />
                </div>
                <div className="mb-4 flex items-center gap-2 rounded-md bg-surface px-3 py-2 font-mono text-sm">
                  <span className="text-text-muted">https://</span>
                  <span>{text}</span>
                  <span className="animate-pulse">|</span>
                </div>
                <div className="mb-4">
                  <div className="mb-2 flex justify-between text-sm">
                    <span>Escaneando...</span>
                    <span className="text-brand">65%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <motion.div
                      className="h-full bg-brand"
                      initial={{ width: '0%' }}
                      animate={{ width: '65%' }}
                      transition={{ duration: 2, delay: 0.8 }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-text-muted">Módulo activo: Análisis de cabeceras HTTP</p>
                </div>
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
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
