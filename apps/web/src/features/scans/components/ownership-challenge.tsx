'use client';

import { Button } from '@vuldetected/ui';
import { useState } from 'react';

import type { OwnershipChallenge } from '../actions';

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
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => {
        setCopied((current) => (current === label ? null : current));
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
        Publica la prueba de propiedad de{' '}
        <span className="font-mono text-text">{challenge.normalizedHostname}</span> con uno de los
        dos métodos y vuelve a verificar. El reto caduca en 30 minutos.
      </p>

      <CopyableValue
        label="Token"
        hint="Valor que debes publicar, tal cual, en el registro TXT o en el archivo."
        value={challenge.token}
        copied={copied === 'Token'}
        onCopy={() => copy('Token', challenge.token)}
      />
      <CopyableValue
        label="Nombre del registro DNS TXT"
        hint="Crea un registro TXT con este nombre y el token como valor."
        value={challenge.txtName}
        copied={copied === 'Nombre del registro DNS TXT'}
        onCopy={() => copy('Nombre del registro DNS TXT', challenge.txtName)}
      />
      <CopyableValue
        label="URL del archivo well-known"
        hint="Sirve el token como texto plano en esta URL, servida por HTTPS."
        value={challenge.wellKnownUrl}
        copied={copied === 'URL del archivo well-known'}
        onCopy={() => copy('URL del archivo well-known', challenge.wellKnownUrl)}
      />

      {/* The copy confirmation is announced, not only shown. */}
      <span aria-live="polite" className="sr-only">
        {copied ? `${copied} copiado al portapapeles.` : ''}
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
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-text">{label}</span>
          <span className="text-xs text-text-muted">{hint}</span>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <code className="break-all font-mono text-xs text-text">{value}</code>
    </div>
  );
}
