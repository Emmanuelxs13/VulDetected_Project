'use server';

import { cookies } from 'next/headers';

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale, isLocale } from '@/i18n/config';

/**
 * Persists the visitor's explicit language choice.
 *
 * ## WHY A SERVER ACTION AND NOT A CLIENT CALL
 *
 * The locale is read on the server (the root layout needs it for `<html lang>`
 * before any HTML is sent). A cookie written by client JavaScript would only be
 * visible on the *next* full request, so the page the visitor just clicked
 * "English" on would stay in Spanish until they navigated. Writing it from the
 * server and then revalidating means the response they get back is already in
 * the language they chose — no reload, no flash.
 *
 * The value is validated against the shipped languages. A cookie is trivially
 * forgeable, so the server must never trust it: an unrecognised value is simply
 * ignored rather than written or reflected.
 */
export async function setLocale(nextLocale: Locale): Promise<void> {
  if (!isLocale(nextLocale)) {
    return;
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, nextLocale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: '/',
    // Not readable from JavaScript: nothing on the client needs it, and keeping
    // it server-only means a script can never forge the document language.
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
