import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import { Toaster } from '@/components/ui/sonner';

import './globals.css';

/**
 * Root layout.
 *
 * ## FONT VARIABLES, NOT FONT CLASSES
 *
 * Both families are registered as CSS custom properties — `--font-geist-sans` and
 * `--font-geist-mono` — and NOT applied via `className`. The design system
 * consumes them inside `--font-sans` / `--font-mono` in `tokens.css`, which
 * already carries fallbacks:
 *
 * ```css
 * --font-sans: var(--font-geist-sans, ui-sans-serif), system-ui, …;
 * ```
 *
 * Putting a class on `<body>` instead would mean the app decides the typeface
 * while the design system believes it does — and any component that renders a
 * `<div>` outside `<body>` would silently fall back to the system stack. One
 * authority, one place.
 *
 * Both `variable` and `className` are attached because Next requires the
 * generated class for the `@font-face` rule to apply at all; the class is an
 * implementation detail, the variable is the interface.
 *
 * ## LANGUAGE
 *
 * The locale is resolved on the server from the `locale` cookie (see
 * `src/i18n/request.ts`) and drives `<html lang>`. That is the whole reason the
 * cookie is read server-side: declaring a language the page is not written in
 * makes a screen reader mispronounce every word, which is a real accessibility
 * defect rather than a cosmetic one.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');

  return {
    title: {
      default: 'VulDetected',
      template: '%s · VulDetected',
    },
    description: t('description'),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations('common');

  return (
    // `lang` is not decoration: it selects the hyphenation and line-breaking
    // rules, and screen readers use it to pick a pronunciation voice. It follows
    // the resolved locale, so English copy is never announced with Spanish
    // phonetics.
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <NextIntlClientProvider>
          {/*
            `skip-nav-content` is the standard Tailwind class for the visually-hidden
            -until-focused skip link. It is the first focusable element in the DOM,
            which is the whole point: a keyboard user must be able to jump past the
            nav on every page instead of tabbing through it.
          */}
          <a
            href="#main"
            className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-text-on-brand"
          >
            {t('skipToContent')}
          </a>

          <div className="flex min-h-dvh flex-col">
            <main id="main" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
          </div>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
