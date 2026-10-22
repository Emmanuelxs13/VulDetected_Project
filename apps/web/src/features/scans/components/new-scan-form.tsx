'use client';

import { Alert, Button, Field, Input } from '@vuldetected/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  requestOwnershipChallengeAction,
  submitScanAction,
  verifyOwnershipAction,
} from '../actions';
import type { OwnershipChallenge } from '../actions';
import { hostnameSchema, normalizeHostname, targetUrlSchema } from '../schema';

import { OwnershipChallengePanel } from './ownership-challenge';

/**
 * The whole scan flow, in the order the domain ownership contract demands
 * (DO-1, DO-2, SS-3):
 *
 *   1. the user names the domain they control;
 *   2. the server issues a single-use challenge token;
 *   3. the user publishes the token (DNS TXT or `/.well-known/`);
 *   4. the server verifies the published proof and records the domain;
 *   5. only then can a target URL be submitted.
 *
 * The steps are a single component on purpose: the state machine IS the
 * product rule, and splitting it across components would let two of them be
 * rendered at once and produce a target form for an unverified domain.
 *
 * ## WHY THE FORM IS NOT A SERVER ACTION FORM
 *
 * `useActionState` drives one action per form. This flow needs three
 * different actions with three different payloads and a branch between them,
 * so the calls are made explicitly and the pending state is owned here. The
 * server still re-validates every input (a server action is a public
 * endpoint); the schemas imported below are the first, fast layer.
 */
export function NewScanForm({ verifiedHosts }: { verifiedHosts: string[] }) {
  const t = useTranslations('scan');
  const [step, setStep] = useState<'ownership' | 'proof' | 'target'>('ownership');
  const [hostname, setHostname] = useState('');
  const [hostnameError, setHostnameError] = useState<string | undefined>(undefined);
  const [challenge, setChallenge] = useState<OwnershipChallenge | null>(null);
  const [method, setMethod] = useState<'dns_txt' | 'well_known'>('dns_txt');
  const [verifiedHost, setVerifiedHost] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [targetError, setTargetError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ title: string; detail?: string } | null>(null);
  const [queuedScanId, setQueuedScanId] = useState<string | null>(null);

  async function requestChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    const parsed = hostnameSchema.safeParse(hostname);
    if (!parsed.success) {
      // The schema message is written for developers; the reader gets the
      // translated copy from the dictionary.
      setHostnameError(t('form.domain.invalid'));
      return;
    }
    setHostnameError(undefined);

    const normalized = normalizeHostname(parsed.data);

    // A domain that is already proven for this account skips the challenge
    // step: asking for a new token the user cannot publish yet would only
    // stall them.
    if (normalized !== null && verifiedHosts.includes(normalized)) {
      setVerifiedHost(normalized);
      setStep('target');
      return;
    }

    setBusy(true);
    const result = await requestOwnershipChallengeAction(parsed.data);
    setBusy(false);

    if (!result.success) {
      setFailure({
        title: t('errors.challengeFailed'),
        detail: result.error,
      });
      return;
    }

    setChallenge(result.data);
    setStep('proof');
  }

  async function verifyProof() {
    if (!challenge) {
      return;
    }
    setFailure(null);
    setBusy(true);

    const result = await verifyOwnershipAction({ hostname: challenge.hostname, method });
    setBusy(false);

    if (!result.success) {
      setFailure({
        title: t('errors.verifyFailed'),
        detail: result.error,
      });
      return;
    }

    setVerifiedHost(result.data.normalizedHostname);
    setStep('target');
  }

  async function submitScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    const parsed = safeParseTarget(targetUrl, t('form.target.invalid'));
    if (!parsed.ok) {
      setTargetError(parsed.error);
      return;
    }
    setTargetError(undefined);

    setBusy(true);
    const result = await submitScanAction({ url: parsed.url });
    setBusy(false);

    if (!result.success) {
      setFailure({
        title: t('errors.submitFailed'),
        detail: result.error,
      });
      return;
    }

    setQueuedScanId(result.data.scanId);
  }

  function restart() {
    setStep('ownership');
    setChallenge(null);
    setVerifiedHost(null);
    setTargetUrl('');
    setTargetError(undefined);
    setFailure(null);
    setQueuedScanId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {failure ? (
        <div aria-live="polite" aria-atomic="true">
          <Alert variant="critical" title={failure.title} description={failure.detail} />
        </div>
      ) : null}

      {queuedScanId ? (
        <div aria-live="polite" aria-atomic="true">
          <Alert variant="success" title={t('queued.title')} description={t('queued.description')}>
            <Button asChild variant="primary" size="sm" className="mt-2">
              <Link href={`/scans/${queuedScanId}`}>{t('queued.action')}</Link>
            </Button>
          </Alert>
        </div>
      ) : null}

      {step === 'ownership' ? (
        <form onSubmit={requestChallenge} className="flex flex-col gap-4" noValidate>
          <Field
            label={t('form.domain.label')}
            required
            description={t('form.domain.description')}
            error={hostnameError}
          >
            {(control) => (
              <Input
                {...control}
                name="hostname"
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder={t('form.domain.placeholder')}
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                required
              />
            )}
          </Field>

          <Button type="submit" variant="primary" loading={busy}>
            {busy ? t('form.domain.submitting') : t('form.domain.submit')}
          </Button>
        </form>
      ) : null}

      {step === 'proof' && challenge ? (
        <div className="flex flex-col gap-4">
          <OwnershipChallengePanel challenge={challenge} />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium text-text-muted">
              {t('form.method.legend')}
            </legend>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name="method"
                value="dns_txt"
                checked={method === 'dns_txt'}
                onChange={() => setMethod('dns_txt')}
                className="h-4 w-4 accent-brand"
              />
              <span>{t('form.method.dnsTxt')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name="method"
                value="well_known"
                checked={method === 'well_known'}
                onChange={() => setMethod('well_known')}
                className="h-4 w-4 accent-brand"
              />
              <span>{t('form.method.wellKnown')}</span>
            </label>
          </fieldset>

          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" loading={busy} onClick={verifyProof}>
              {busy ? t('form.method.verifying') : t('form.method.verify')}
            </Button>
            <Button type="button" variant="ghost" onClick={restart}>
              {t('form.method.changeDomain')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'target' ? (
        <form onSubmit={submitScan} className="flex flex-col gap-4" noValidate>
          <p className="text-xs text-text-muted">
            {t('form.target.verifiedDomainLabel')}{' '}
            <span className="font-mono text-text">{verifiedHost}</span>
          </p>

          <Field
            label={t('form.target.label')}
            required
            description={t('form.target.description')}
            error={targetError}
          >
            {(control) => (
              <Input
                {...control}
                name="targetUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder={t('form.target.placeholder')}
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                required
              />
            )}
          </Field>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" loading={busy}>
              {busy ? t('form.target.submitting') : t('form.target.submit')}
            </Button>
            <Button type="button" variant="ghost" onClick={restart}>
              {t('form.target.scanAnother')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Client-side validation of the target URL.
 *
 * `targetUrlSchema` normalises the URL (SS-1), and its transform rejects a
 * hostname that can never be a domain. A transform that throws is not a
 * validation failure Zod can report, so the call is guarded: an unexpected
 * exception becomes an ordinary validation message instead of a broken form.
 */
function safeParseTarget(
  value: string,
  invalidMessage: string,
): { ok: true; url: string } | { ok: false; error: string } {
  try {
    const parsed = targetUrlSchema.safeParse(value);
    if (!parsed.success) {
      return { ok: false, error: invalidMessage };
    }
    return { ok: true, url: parsed.data.url };
  } catch {
    return { ok: false, error: invalidMessage };
  }
}
