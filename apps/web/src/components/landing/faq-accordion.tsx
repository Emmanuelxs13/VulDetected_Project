'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@vuldetected/ui';
import { landingContent } from '@/content/landing.es';

export function FaqAccordion() {
  return (
    <section id="preguntas" className="py-20 bg-surface">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-12 text-center sm:text-4xl">{landingContent.faq.title}</h2>
        <Accordion type="single" collapsible className="w-full">
          {landingContent.faq.items.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
              <AccordionContent className="text-text-muted">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
