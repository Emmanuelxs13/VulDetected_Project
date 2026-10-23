'use client';

import { Button } from '@vuldetected/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { OwnershipChallenge } from '../actions';

type CopyTarget = 'token' | 'txtName' | 'wellKnown';

/** Label key per copy target, so the live announcement is translated too. */
const LABEL_KEYS: Record<CopyTarget, string> = {
  token: 'form.challenge.token.label',
  txtName: 'form.challenge.txtName.label',
  wellKnown: 'form.challenge.wellKnown.label',
};

/**
 * The ownership proof the user has to publish.
 *
 * ## WHY EVERY VALUE IS COPYABLE
 *
 * These three strings are the entire deliverable of the challenge step: the
 * user has to carry a 64-character hex token into a DNS zone or into a file
 * served by their web server. Typing it by hand is the single most likely
 * place for this flow to fail, and a mistyped token fails as a generic
 * "does not match" error that sends the user looking in the wrong place.
 * One click per value removes that failure mode.
 */
export function OwnershipChallengePanel({ challenge }: { challenge: OwnershipChallenge }) {
  const t = useTranslations('scan');
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  async function copy(target: CopyTarget, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => {
        setCopied((current) => (current === target ? null : current));
      }, 2500);
    } catch {
      // Clipboard access can be denied (insecure context, permissions). The
      // value stays selectable on screen, so the flow still works.
      setCopied(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-5 text-text-muted">
        {t('form.challenge.intro', { hostname: challenge.normalizedHostname })}
      </p>

      <CopyableValue
        label={t('form.challenge.token.label')}
        hint={t('form.challenge.token.hint')}
        value={challenge.token}
        copied={copied === 'token'}
        onCopy={() => copy('token', challenge.token)}
      />
      <CopyableValue
        label={t('form.challenge.txtName.label')}
        hint={t('form.challenge.txtName.hint')}
        value={challenge.txtName}
        copied={copied === 'txtName'}
        onCopy={() => copy('txtName', challenge.txtName)}
      />
      <CopyableValue
        label={t('form.challenge.wellKnown.label')}
        hint={t('form.challenge.wellKnown.hint')}
        value={challenge.wellKnownUrl}
        copied={copied === 'wellKnown'}
        onCopy={() => copy('wellKnown', challenge.wellKnownUrl)}
      />

      {/* The copy confirmation is announced, not only shown. */}
      <span aria-live="polite" className="sr-only">
        {copied ? t('form.challenge.copiedAnnouncement', { label: t(LABEL_KEYS[copied]) }) : ''}
      </span>
    </div>
  );
}

function CopyableValue({
  label,
  hint,
  value,
  copied,
  onCopy,
}: {
  label: string;
  hint: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const t = useTranslations('scan');

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-text">{label}</span>
          <span className="text-xs text-text-muted">{hint}</span>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
          {copied ? t('form.challenge.copied') : t('form.challenge.copy')}
        </Button>
      </div>
      <code className="break-all font-mono text-xs text-text">{value}</code>
    </div>
  );
}
