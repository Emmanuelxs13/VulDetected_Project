import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './config';

/**
 * Resolves the language for the current request from the `locale` cookie.
 *
 * This runs on the server for every request, which is the point: the root
 * layout needs the resolved locale to set `<html lang>` correctly, and every
 * translated string is rendered server-side rather than swapped in after
 * hydration.
 *
 * An unknown or missing cookie falls back to Spanish — the original language.
 * That fallback is deliberate: a forged cookie value must never crash a render
 * or resolve to a language we do not ship.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
