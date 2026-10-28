'use client';

import { Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';

import { signIn } from '@/lib/auth-client';

export function SocialButtons({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth');
  const hasGoogle = Boolean(process.env.NEXT_PUBLIC_GOOGLE_ENABLED);
  const hasGithub = Boolean(process.env.NEXT_PUBLIC_GITHUB_ENABLED);
  if (!hasGoogle && !hasGithub) return null;

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
      {hasGoogle ? (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => signIn.social({ provider: 'google', callbackURL: '/dashboard' })}
        >
          {mode === 'login' ? t('social.continueGoogle') : t('social.signUpGoogle')}
        </Button>
      ) : null}
      {hasGithub ? (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => signIn.social({ provider: 'github', callbackURL: '/dashboard' })}
        >
          {mode === 'login' ? t('social.continueGithub') : t('social.signUpGithub')}
        </Button>
      ) : null}
    </div>
  );
}
