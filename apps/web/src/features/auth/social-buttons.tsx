'use client';

import { Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';

import type { SocialProviderId } from '@/lib/auth/social';
import { signIn } from '@/lib/auth-client';

/**
 * The social sign-in buttons.
 *
 * ## The providers are a PROP, not a `NEXT_PUBLIC_*` read
 *
 * They used to come from two build-time variables read inside this component.
 * That allowed a screen to render a Google button while the server had no Google
 * provider registered — the failure then happens after the click, which is the
 * worst possible moment to discover a configuration mistake. The ids now come
 * from the same resolution the auth instance uses (`lib/auth/social.ts`), passed
 * down from the page.
 *
 * ## `errorCallbackURL` is why the user sees a message instead of a dead end
 *
 * Better Auth redirects an OAuth failure to `${baseURL}/error?error=...` by
 * default, and this app has no such route — the user would land on a 404 with no
 * explanation. Pointing failures back at the login screen is what makes
 * "account not linked" (ADR 0016) something a person can read and act on.
 *
 * ## `simulated` is not decoration
 *
 * When the demo provider stands in for Google, the screen says so. A demo that
 * quietly pretends to be Google teaches the audience the wrong thing about what
 * was actually verified.
 */
export function SocialButtons({
  mode,
  providers,
  simulated = false,
}: {
  mode: 'login' | 'register';
  providers: readonly SocialProviderId[];
  simulated?: boolean;
}) {
  const t = useTranslations('auth');
  if (providers.length === 0) return null;

  const start = (provider: SocialProviderId) =>
    signIn.social({
      provider,
      callbackURL: '/dashboard',
      errorCallbackURL: '/login',
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface px-2 text-text-muted">{t('social.or')}</span>
        </div>
      </div>
      {providers.includes('google') ? (
        <Button type="button" variant="secondary" fullWidth onClick={() => start('google')}>
          {mode === 'login' ? t('social.continueGoogle') : t('social.signUpGoogle')}
        </Button>
      ) : null}
      {providers.includes('github') ? (
        <Button type="button" variant="secondary" fullWidth onClick={() => start('github')}>
          {mode === 'login' ? t('social.continueGithub') : t('social.signUpGithub')}
        </Button>
      ) : null}
      {simulated ? (
        <p className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-text-muted">
          {t('social.simulated')}
        </p>
      ) : null}
    </div>
  );
}
