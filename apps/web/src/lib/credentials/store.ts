import 'server-only';

import { and, desc, domains, eq, isNull, scanCredentials } from '@vuldetected/db';

import { db } from '../db';
import { credentialAad, CredentialCryptoError, openWithKey, sealWithKey } from './crypto';
import { credentialKeyring, keyForVersion } from './keyring';
import { CredentialSecretError, parseCredentialSecret, serializeCredentialSecret } from './secret';
import type { CredentialSecret, WorkerCredentialPayload } from './secret';
import type { CredentialListRow } from './types';

export type { CredentialListRow } from './types';

/**
 * The database-facing half of scan credentials.
 *
 * ## The one rule this module exists to enforce
 *
 * A credential row is never returned to a caller in usable form except through
 * `activeCredentialForScan`, which is the enqueue path. The list the settings UI
 * renders selects an explicit column set that excludes `ciphertext`, so there is
 * no function here that hands a sealed blob to a page.
 *
 * ## Failing closed, and why that is the product decision
 *
 * If a domain has an active credential and it cannot be decrypted — a rotated key
 * that is no longer configured, a tampered row, a payload this build does not
 * understand — the scan is refused with `credential_unavailable` instead of
 * running without authentication. Running anonymously would produce a report that
 * looks like a clean bill of health for a site whose interesting half is behind a
 * login. A visible refusal is recoverable; a silently shallower scan is not.
 */

export type CredentialUnavailableReason =
  'keyring_unconfigured' | 'unknown_key_version' | 'unreadable';

export class CredentialUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: CredentialUnavailableReason,
  ) {
    super(message);
    this.name = 'CredentialUnavailableError';
  }
}

/** A credential ready to be attached to a scan job. */
export interface ResolvedCredential {
  credentialId: string;
  payload: WorkerCredentialPayload;
}

/**
 * Seals a validated secret with the current key.
 *
 * Returns the two columns the table stores, so the caller never has to know the
 * byte layout or which key was current.
 */
export function sealCredential(
  domainId: string,
  secret: CredentialSecret,
): { ciphertext: string; keyVersion: number } {
  let ring;
  try {
    ring = credentialKeyring();
  } catch (error) {
    throw new CredentialUnavailableError(
      error instanceof Error ? error.message : 'Credential keyring is not configured.',
      'keyring_unconfigured',
    );
  }

  return {
    ciphertext: sealWithKey(
      ring.current.key,
      serializeCredentialSecret(secret),
      credentialAad(domainId),
    ),
    keyVersion: ring.current.version,
  };
}

/**
 * The active credential for a domain, decrypted and validated, or `null`.
 *
 * Throws `CredentialUnavailableError` when a row exists but cannot produce a
 * usable credential. Returning `null` in that case would be indistinguishable
 * from "this domain has no credential", which is exactly the silent degradation
 * described above.
 */
export async function activeCredentialForScan(
  domainId: string,
): Promise<ResolvedCredential | null> {
  const rows = await db()
    .select({
      id: scanCredentials.id,
      domainId: scanCredentials.domainId,
      kind: scanCredentials.kind,
      ciphertext: scanCredentials.ciphertext,
      keyVersion: scanCredentials.keyVersion,
    })
    .from(scanCredentials)
    .where(and(eq(scanCredentials.domainId, domainId), isNull(scanCredentials.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    return null;
  }

  try {
    const ring = credentialKeyring();
    const key = keyForVersion(ring, row.keyVersion);

    if (key === null) {
      throw new CredentialUnavailableError(
        `Credential was sealed with key version ${row.keyVersion}, which this deployment does not have.`,
        'unknown_key_version',
      );
    }

    const plaintext = openWithKey(key.key, row.ciphertext, credentialAad(row.domainId));
    const payload = parseCredentialSecret(plaintext, row.kind);

    return { credentialId: row.id, payload };
  } catch (error) {
    if (error instanceof CredentialUnavailableError) {
      throw error;
    }

    if (error instanceof CredentialCryptoError) {
      throw new CredentialUnavailableError(
        `Stored credential could not be decrypted (${error.reason}).`,
        'unreadable',
      );
    }

    if (error instanceof CredentialSecretError) {
      throw new CredentialUnavailableError(
        `Stored credential is not usable: ${error.message}`,
        'unreadable',
      );
    }

    throw error;
  }
}

/** Records that the scanner used this row, for the settings list. */
export async function markCredentialUsed(credentialId: string): Promise<void> {
  await db()
    .update(scanCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(scanCredentials.id, credentialId));
}

/** What the settings list renders. Never includes `ciphertext`. */
export async function listActiveCredentials(userId: string): Promise<CredentialListRow[]> {
  const rows = await db()
    .select({
      id: scanCredentials.id,
      domainId: scanCredentials.domainId,
      hostname: domains.normalizedHostname,
      label: scanCredentials.label,
      kind: scanCredentials.kind,
      lastUsedAt: scanCredentials.lastUsedAt,
      createdAt: scanCredentials.createdAt,
    })
    .from(scanCredentials)
    .innerJoin(domains, eq(scanCredentials.domainId, domains.id))
    .where(and(eq(scanCredentials.userId, userId), isNull(scanCredentials.revokedAt)))
    .orderBy(desc(scanCredentials.createdAt));

  return rows.map((row) => ({
    id: row.id,
    domainId: row.domainId,
    hostname: row.hostname,
    label: row.label,
    kind: row.kind,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
