/**
 * The languages this product ships, and which one a new visitor gets.
 *
 * Spanish is the original language: the copy for every screen is written in
 * Spanish first and translated to English afterwards. Keeping that order is a
 * product decision, not a leftover — the default has to be the language the
 * copy was authored in, otherwise the "default" would already be a translation.
 */
export const LOCALES = ['es', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** Spanish is the original language, so it is what an undecided visitor sees. */
export const DEFAULT_LOCALE: Locale = 'es';

/**
 * The cookie that remembers a visitor's explicit choice.
 *
 * A cookie (not `localStorage`) because the locale has to be known on the
 * server: the root layout reads it to set `<html lang>`, and the translated
 * text is rendered server-side. Resolving it on the client would flash the
 * wrong language on every navigation.
 */
export const LOCALE_COOKIE = 'locale';

/** One year: the preference is durable, not per-session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Human-readable label for each language, written in that same language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
