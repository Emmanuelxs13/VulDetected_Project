'use client';

import { Badge, Button } from '@vuldetected/ui';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function Hero() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(109,92,231,0.15),rgba(255,255,255,0))]" />
      
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="info" className="mb-6">
              Auditoría de Seguridad Web Automatizada
            </Badge>
          </motion.div>

          <motion.h1
            className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Seguridad web{' '}
            <span className="bg-gradient-to-r from-brand to-iris-400 bg-clip-text text-transparent">
              clara y accionable
            </span>
          </motion.h1>

          <motion.p
            className="mt-6 text-lg leading-8 text-text-muted sm:text-xl"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Democratiza la ciberseguridad traduciendo hallazgos técnicos del OWASP Top 10 en
            planes de acción claros. Sin jerga innecesaria, con código de remediación listo para
            implementar.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Button asChild size="lg" variant="primary">
              <Link href="/register">Escanear mi sitio gratis</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="#how-it-works">Cómo funciona</Link>
            </Button>
          </motion.div>
        </div>

        <motion.div
          className="mt-16 flow-root sm:mt-24"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 40 }}
          animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <div className="relative -m-2 rounded-xl bg-surface/50 p-2 ring-1 ring-inset ring-border lg:-m-4 lg:rounded-2xl lg:p-4">
            <div className="rounded-md bg-surface-raised p-4 ring-1 ring-border">
              <div className="flex items-center gap-2 border-b border-border pb-4">
                <div className="h-3 w-3 rounded-full bg-critical" />
                <div className="h-3 w-3 rounded-full bg-medium" />
                <div className="h-3 w-3 rounded-full bg-low" />
                <div className="ml-4 text-xs text-text-muted">vuldetected.com/scan</div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Escaneando ejemplo.com...</span>
                  <span className="text-sm text-brand">65%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                  <motion.div
                    className="h-full bg-brand"
                    initial={{ width: '0%' }}
                    animate={{ width: '65%' }}
                    transition={{ duration: 2, delay: 0.8 }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="rounded-lg bg-surface p-3">
                    <div className="text-lg font-semibold text-critical">3</div>
                    <div className="text-xs text-text-muted">Críticas</div>
                  </div>
                  <div className="rounded-lg bg-surface p-3">
                    <div className="text-lg font-semibold text-high">5</div>
                    <div className="text-xs text-text-muted">Altas</div>
                  </div>
                  <div className="rounded-lg bg-surface p-3">
                    <div className="text-lg font-semibold text-medium">8</div>
                    <div className="text-xs text-text-muted">Medias</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
