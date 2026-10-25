import type { Metadata } from 'next';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { HeroAnimated } from '@/components/landing/hero-animated';
import { BenefitsTabs } from '@/components/landing/benefits-tabs';
import { FeaturesBento } from '@/components/landing/features-bento';
import { FaqAccordion } from '@/components/landing/faq-accordion';
import { TeamSection } from '@/components/landing/team-section';
import { ProductPreview } from '@/components/landing/product-preview';
import { OwaspMarquee } from '@/components/landing/owasp-marquee';
import { SecurityTrust } from '@/components/landing/security-trust';
import { PricingSection } from '@/components/landing/pricing-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { landingContent } from '@/content/landing.es';
import { Button } from '@vuldetected/ui';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'VulDetected - Auditoría de Seguridad Web Automatizada',
  description: 'Encuentra y corrige las vulnerabilidades de tu sitio web en menos de 24 horas. VulDetected audita tu aplicación, detecta los fallos del OWASP Top 10 y te dice exactamente cómo solucionarlos.',
  openGraph: {
    title: 'VulDetected - Auditoría de Seguridad Web Automatizada',
    description: 'Encuentra y corrige las vulnerabilidades de tu sitio web en menos de 24 horas.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VulDetected - Auditoría de Seguridad Web Automatizada',
    description: 'Encuentra y corrige las vulnerabilidades de tu sitio web en menos de 24 horas.',
  },
};

export default function HomePage() {
  const softwareAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'VulDetected',
    applicationCategory: 'SecurityApplication',
    operatingSystem: 'Web',
    description: 'Auditoría de seguridad web automatizada. Detecta vulnerabilidades OWASP Top 10 y genera plan de remediación con código.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '127',
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: landingContent.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <LandingNavbar />
      <LandingNavbar />
      <HeroAnimated />
      
      <section className="py-20 bg-surface">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-8 sm:text-4xl">{landingContent.problem.title}</h2>
          <div className="space-y-6">
            {landingContent.problem.points.map((point, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-4xl font-bold text-brand">{i + 1}</span>
                <p className="text-lg leading-relaxed text-text-muted pt-2">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="py-20">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-12 text-center sm:text-4xl">{landingContent.howItWorks.title}</h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {landingContent.howItWorks.steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="mb-4 text-5xl font-bold text-brand/20">{step.number}</div>
                <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                <p className="text-text-muted">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BenefitsTabs />
      <ProductPreview />
      <FeaturesBento />
      <OwaspMarquee />
      <SecurityTrust />
      <PricingSection />
      <FaqAccordion />
      <TeamSection />

      <section className="py-20 bg-brand">
        <div className="container mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-6 text-3xl font-bold text-text-on-brand sm:text-4xl">{landingContent.cta.title}</h2>
          <Button asChild size="lg" variant="secondary" className="mb-4">
            <Link href="/register">{landingContent.cta.button}</Link>
          </Button>
          <p className="text-sm text-text-on-brand/80">{landingContent.cta.microtext}</p>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
