import type { Locale } from '@/i18n/config';

/**
 * Teaches `next-intl` which languages this app actually ships.
 *
 * Without this the library falls back to `string`, and `useLocale()` would be
 * typed as any arbitrary string — so a typo like `'esp'` would compile and only
 * fail at runtime. Declaring the union here makes an unknown locale a type error,
 * which is the cheapest possible place to catch it.
 *
 * `declare module` has to live in a file the compiler always sees, which is why
 * it sits next to the config rather than inside it.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
  }
}
