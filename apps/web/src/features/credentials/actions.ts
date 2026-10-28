'use server';

import { and, domains, eq, isNull, scanCredentials } from '@vuldetected/db';

import type { ActionResult } from '@/features/auth/actions';
import { requireUser } from '@/features/auth/session';
import { audit } from '@/lib/audit';
import {
  CredentialUnavailableError,
  listActiveCredentials,
  sealCredential,
  type CredentialListRow,
} from '@/lib/credentials/store';
import { saveCredentialSchema } from '@/lib/credentials/secret';
import { db } from '@/lib/db';

/**
 * Scan credential actions.
 *
 * ## Two credentials per domain, but only one alive at a time
 *
 * A partial unique index (`scan_credentials_active_domain_unique`) allows one
 * row per domain where `revoked_at IS NULL`. Saving therefore revokes the current
 * row and inserts the new one inside a single transaction: revoking first is
 * required by the index, and the transaction is required so a failed insert does
 * not leave the domain with no credential at all.
 *
 * ## The secret leaves the browser once
 *
 * The plaintext arrives in the action argument, is sealed immediately, and is
 * never written to an audit row, a log or a returned value. The list action
 * returns labels and timestamps only — `listActiveCredentials` does not even
 * select `ciphertext`.
 */

export async function listCredentialsAction(): Promise<ActionResult<CredentialListRow[]>> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  return { success: true, data: await listActiveCredentials(userId) };
}

/**
 * Stores a credential for one of the caller's *verified* domains.
 *
 * Verified, not merely owned: a credential attached to a hostname the user never
 * proved they control would let them aim authenticated requests at a site that is
 * not theirs, which is exactly what the ownership flow prevents.
 */
export async function saveCredentialAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = saveCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'invalid_credential' };
  }

  const { domainId, label, secret } = parsed.data;

  const domainRows = await db()
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.userId, userId), eq(domains.verified, true)))
    .limit(1);

  if (domainRows.length === 0) {
    return { success: false, error: 'domain_not_verified' };
  }

  let sealed: { ciphertext: string; keyVersion: number };
  try {
    sealed = sealCredential(domainId, secret);
  } catch (error) {
    if (error instanceof CredentialUnavailableError) {
      // The deployment has no usable key. Nothing is written, and the user is
      // told the storage is unavailable instead of "invalid credential".
      console.error('[credentials] cannot seal: %s', error.message);
      return { success: false, error: 'storage_unavailable' };
    }
    throw error;
  }

  const now = new Date();

  const inserted = await db().transaction(async (tx) => {
    await tx
      .update(scanCredentials)
      .set({ revokedAt: now })
      .where(
        and(
          eq(scanCredentials.domainId, domainId),
          eq(scanCredentials.userId, userId),
          isNull(scanCredentials.revokedAt),
        ),
      );

    return tx
      .insert(scanCredentials)
      .values({
        domainId,
        userId,
        label,
        kind: secret.kind,
        ciphertext: sealed.ciphertext,
        keyVersion: sealed.keyVersion,
      })
      .returning({ id: scanCredentials.id });
  });

  const id = inserted[0]?.id;
  if (id === undefined) {
    return { success: false, error: 'storage_unavailable' };
  }

  await audit({
    action: 'scan_credential.created',
    actorUserId: userId,
    targetType: 'scan_credential',
    targetId: id,
    // The label and the scheme describe the credential; the secret itself never
    // appears here, and `metadata` being scalars-only makes that a type error to
    // attempt.
    metadata: { kind: secret.kind, domainId, label },
  });

  return { success: true, data: { id } };
}

/**
 * Revokes a credential.
 *
 * Soft, not `DELETE`: `scans.credential_id` references the row, and "which secret
 * produced this report" has to stay answerable after a rotation. Scoping on
 * `user_id` in the UPDATE means a guessed id from another account matches zero
 * rows and gets the same answer as a nonexistent one.
 */
export async function revokeCredentialAction(credentialId: string): Promise<ActionResult<null>> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const revoked = await db()
    .update(scanCredentials)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(scanCredentials.id, credentialId),
        eq(scanCredentials.userId, userId),
        isNull(scanCredentials.revokedAt),
      ),
    )
    .returning({ id: scanCredentials.id });

  if (revoked.length === 0) {
    return { success: false, error: 'credential_not_found' };
  }

  await audit({
    action: 'scan_credential.revoked',
    actorUserId: userId,
    targetType: 'scan_credential',
    targetId: credentialId,
  });

  return { success: true, data: null };
}
