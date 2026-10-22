'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

import { LOCALE_LABELS, LOCALES, type Locale } from '@/i18n/config';
import { setLocale } from '@/i18n/actions';

/**
 * Language switch for the header.
 *
 * ## WHY THIS DOES NOT USE `@vuldetected/ui`
 *
 * This is a two-state toggle whose labels are the languages themselves
 * ("Español" / "English"), and the package has no such variant. Adding one would
 * mean editing a read-only package for a single call site.
 *
 * ## WHY IT DISABLES WHILE PENDING
 *
 * The switch triggers a server round-trip (the cookie write) followed by a
 * refresh. Without a pending state a fast double-click can queue two switches
 * and land on the language the visitor did not pick last. Disabling the buttons
 * for the duration makes the outcome match the intent.
 */
export function LocaleSwitcher() {
  const activeLocale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSelect(next: Locale) {
    if (next === activeLocale) return;

    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className="flex items-center rounded-md border border-border p-0.5"
    >
      {LOCALES.map((optionLocale) => {
        const isActive = optionLocale === activeLocale;

        return (
          <button
            key={optionLocale}
            type="button"
            onClick={() => onSelect(optionLocale)}
            disabled={isPending}
            aria-pressed={isActive}
            /*
             * `lang` on each button so a screen reader announces "English" with
             * English phonetics even while the document is in Spanish, and vice
             * versa. The switch is precisely where mixed-language content is
             * expected, so this is the one place it matters most.
             */
            lang={optionLocale}
            className={
              isActive
                ? 'focus-ring rounded-sm bg-brand px-2 py-0.5 text-xs font-medium text-text-on-brand'
                : 'focus-ring rounded-sm px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:text-text disabled:opacity-50'
            }
          >
            {LOCALE_LABELS[optionLocale]}
          </button>
        );
      })}
    </div>
  );
}
