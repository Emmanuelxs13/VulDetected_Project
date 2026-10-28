'use client';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@vuldetected/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { CredentialListRow } from '@/lib/credentials/types';

import { revokeCredentialAction, saveCredentialAction } from '../actions';
import { CREDENTIAL_ERROR_KEYS, isCredentialErrorCode } from '../error-codes';

type Kind = 'basic' | 'bearer' | 'header';

interface VerifiedDomain {
  id: string;
  hostname: string;
}

/**
 * Credential management.
 *
 * ## Why the password field is a one-way door
 *
 * The stored secret is sealed and never read back into the browser: replacing a
 * credential means typing it again. That is not a missing feature. A "show saved
 * password" button would put the plaintext in a client component's state and in
 * the network response, which is precisely what encrypting the column prevents.
 *
 * ## Why the form is a plain `useState` form and not a server-rendered one
 *
 * The kind decides which fields exist, and the secret must never be submitted on
 * a form whose shape the server guesses. The action validates the full payload
 * again — this component's job is only to send the right fields.
 */
export function CredentialsSection({
  verifiedDomains,
  credentials,
}: {
  verifiedDomains: VerifiedDomain[];
  credentials: CredentialListRow[];
}) {
  const t = useTranslations('credentials');
  const format = useFormatter();

  const [domainId, setDomainId] = useState(verifiedDomains[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<Kind>('basic');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [headerName, setHeaderName] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  function secretFor(kindValue: Kind) {
    if (kindValue === 'basic') {
      return { kind: 'basic' as const, username, password };
    }
    if (kindValue === 'bearer') {
      return { kind: 'bearer' as const, token };
    }
    return { kind: 'header' as const, headerName, headerValue };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);

    const result = await saveCredentialAction({ domainId, label, secret: secretFor(kind) });

    setBusy(false);

    if (!result.success) {
      setMessage({
        type: 'error',
        text: isCredentialErrorCode(result.error)
          ? t(CREDENTIAL_ERROR_KEYS[result.error])
          : result.error,
      });
      return;
    }

    setLabel('');
    setUsername('');
    setPassword('');
    setToken('');
    setHeaderName('');
    setHeaderValue('');
    setMessage({ type: 'success', text: t('saved') });
    window.location.reload();
  }

  async function revoke(id: string) {
    setMessage(null);
    setPendingRevoke(id);
    const result = await revokeCredentialAction(id);
    setPendingRevoke(null);

    if (!result.success) {
      setMessage({
        type: 'error',
        text: isCredentialErrorCode(result.error)
          ? t(CREDENTIAL_ERROR_KEYS[result.error])
          : result.error,
      });
      return;
    }

    setMessage({ type: 'success', text: t('revoked') });
    window.location.reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {credentials.length === 0 ? (
          <p className="text-sm text-text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {credentials.map((credential) => (
              <li
                key={credential.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">
                    {credential.hostname} · {credential.label}
                  </span>
                  <span className="text-xs text-text-muted">
                    {t(`kinds.${credential.kind}` as 'kinds.basic')} ·{' '}
                    {credential.lastUsedAt
                      ? `${t('lastUsed')}: ${format.dateTime(new Date(credential.lastUsedAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}`
                      : t('neverUsed')}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => revoke(credential.id)}
                  loading={pendingRevoke === credential.id}
                >
                  {pendingRevoke === credential.id ? t('revoking') : t('revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {message ? (
          <Alert variant={message.type === 'error' ? 'critical' : 'success'} title={message.text} />
        ) : null}

        {verifiedDomains.length === 0 ? (
          <p className="text-sm text-text-muted">{t('noVerified')}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('domain')} required>
                {(control) => (
                  <select
                    {...control}
                    value={domainId}
                    onChange={(event) => setDomainId(event.target.value)}
                    className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-text"
                  >
                    {verifiedDomains.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.hostname}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label={t('label')} required>
                {(control) => (
                  <Input
                    {...control}
                    value={label}
                    placeholder={t('labelPlaceholder')}
                    maxLength={80}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field label={t('kind')} required>
              {(control) => (
                <select
                  {...control}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as Kind)}
                  className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-text"
                >
                  <option value="basic">{t('kinds.basic')}</option>
                  <option value="bearer">{t('kinds.bearer')}</option>
                  <option value="header">{t('kinds.header')}</option>
                </select>
              )}
            </Field>

            {kind === 'basic' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('username')} required>
                  {(control) => (
                    <Input
                      {...control}
                      value={username}
                      autoComplete="off"
                      maxLength={256}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('password')} required>
                  {(control) => (
                    <Input
                      {...control}
                      type="password"
                      value={password}
                      autoComplete="new-password"
                      maxLength={1024}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  )}
                </Field>
              </div>
            ) : null}

            {kind === 'bearer' ? (
              <Field label={t('token')} required>
                {(control) => (
                  <Input
                    {...control}
                    type="password"
                    value={token}
                    autoComplete="off"
                    maxLength={4096}
                    onChange={(event) => setToken(event.target.value)}
                  />
                )}
              </Field>
            ) : null}

            {kind === 'header' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('headerName')} required>
                  {(control) => (
                    <Input
                      {...control}
                      value={headerName}
                      autoComplete="off"
                      maxLength={128}
                      placeholder="X-Api-Key"
                      onChange={(event) => setHeaderName(event.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('headerValue')} required>
                  {(control) => (
                    <Input
                      {...control}
                      type="password"
                      value={headerValue}
                      autoComplete="off"
                      maxLength={4096}
                      onChange={(event) => setHeaderValue(event.target.value)}
                    />
                  )}
                </Field>
              </div>
            ) : null}

            <div>
              <Button type="submit" variant="primary" loading={busy}>
                {busy ? t('saving') : t('save')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
