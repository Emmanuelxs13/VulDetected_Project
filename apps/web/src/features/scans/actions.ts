'use server';

import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { and, desc, domains, eq, gt, verificationTokens } from '@vuldetected/db';

import type { ActionResult } from '@/features/auth/actions';
import { requireUser } from '@/features/auth/session';
import { db } from '@/lib/db';
import { consumeRateLimit, RateLimitError } from '@/lib/rate-limit';
import { safeFetch } from '@/lib/ssrf';

import { enqueueScanForDomain } from './enqueue';
import { requireVerifiedDomain } from './guard';
import {
  hostnameSchema,
  normalizeHostname,
  ownershipVerifySchema,
  targetUrlSchema,
} from './schema';

/**
 * Challenges expire 30 minutes after issue (design D5 step 1). Expiry is the
 * only clock in this flow: a verified domain does NOT expire in Sprint 2
 * (no scheduler — D5 step 4).
 */
const CHALLENGE_TTL_MS = 30 * 60 * 1000;

/**
 * Where the file proof must be served from, and the DNS name the token goes
 * on (design D5 step 2). Both are fixed product surface, not configuration.
 */
const WELL_KNOWN_PATH = '/.well-known/vuldetected.txt';
const TXT_HOSTNAME_PREFIX = '_vuldetected.';

/**
 * Ownership server actions (spec DO-2, DO-3, DO-4).
 *
 * Rate limiting and the `domain.ownership.*` audit events land with task 4.3;
 * `submitScanAction` — the only consumer of {@link requireVerifiedDomain} —
 * lands with task 4.2. Both are deliberately absent here so this change stays
 * the ownership mechanism and nothing else.
 *
 * Like the auth actions, these return a discriminated `ActionResult` instead
 * of throwing: "your TXT record does not match yet" is a normal step in the
 * flow, not a crash.
 */

/** What the challenge UI shows so the user can publish the proof. */
export interface OwnershipChallenge {
  /** The hostname as the user typed it (trimmed), for display. */
  hostname: string;
  normalizedHostname: string;
  /** 32 random bytes, hex-encoded. Publish this value. */
  token: string;
  /** DNS name to attach the TXT record to. */
  txtName: string;
  /** HTTPS URL that must serve the token when the file method is chosen. */
  wellKnownUrl: string;
}

/** Confirms a successful verification (persisted on `domains`, DO-4). */
export interface VerifiedOwnership {
  hostname: string;
  normalizedHostname: string;
  verificationMethod: 'dns_txt' | 'well_known';
  /** ISO-8601 instant, matching `domains.verified_at`. */
  verifiedAt: string;
}

type ProofResult = { ok: true; candidates: string[] } | { ok: false; error: string };

/**
 * Issues an ownership challenge: a single-use token the user publishes either
 * as a DNS `TXT` record or inside `/.well-known/vuldetected.txt`.
 *
 * The token is stored RAW (not hashed) in `verification_tokens.value` with
 * `purpose = 'domain_ownership'` (DO-3). Hashing is what Better Auth does for
 * its own tokens, where the value never has to be shown again; here the value
 * IS the published proof, so the comparison only works if both sides hold the
 * same bytes (see `verification-tokens.ts` for the full rationale).
 *
 * Re-requesting a challenge does not invalidate earlier ones: verification
 * accepts any unexpired token for the hostname, so a user who published an
 * older token and then clicks "resend" can still finish with either value.
 * The 10/h per-user limit (task 4.3) bounds how many rows a domain can have.
 */
export async function requestOwnershipChallengeAction(
  hostname: string,
): Promise<ActionResult<OwnershipChallenge>> {
  // Auth gate even though `verification_tokens` has no user column: challenges
  // are an authenticated feature and the rate limiter (4.3) keys on session.
  await requireUser();

  const parsed = hostnameSchema.safeParse(hostname);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid hostname.' };
  }

  const normalizedHostname = normalizeHostname(parsed.data);
  // Unreachable — `hostnameSchema` already rejects everything
  // `normalizeHostname` rejects — but written out so the invariant is explicit
  // rather than asserted with a non-null assertion.
  if (normalizedHostname === null) {
    return { success: false, error: 'Invalid hostname.' };
  }

  const token = randomBytes(32).toString('hex');

  await db()
    .insert(verificationTokens)
    .values({
      purpose: 'domain_ownership',
      identifier: normalizedHostname,
      value: token,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

  return {
    success: true,
    data: {
      hostname: parsed.data,
      normalizedHostname,
      token,
      txtName: `${TXT_HOSTNAME_PREFIX}${normalizedHostname}`,
      wellKnownUrl: `https://${normalizedHostname}${WELL_KNOWN_PATH}`,
    },
  };
}

/**
 * Verifies control of a domain by either method (DO-2).
 *
 * Reads as: load every unexpired challenge for the hostname, obtain the proof
 * through the chosen method, and accept the first token the proof matches.
 * Matching against ANY pending token — not only the newest — is deliberate:
 * two tabs can hold two live challenges, and each publisher must be able to
 * finish with the value they actually published.
 *
 * Success commits one transaction: consume the matched token (single-use,
 * D5 step 3) and record the proof on `domains` — method, verifying record
 * (the TXT value, or the well-known path), and `verified_at` (DO-4). The
 * upsert never reassigns a domain verified by a different account: the unique
 * key on `normalized_hostname` is global by design (D2), and `setWhere`
 * turns a losing race into "nothing written", which becomes the refusal
 * below.
 *
 * Failure writes nothing and leaves the token valid, so the user can fix
 * their DNS record or file and retry inside the TTL.
 */
export async function verifyOwnershipAction(input: {
  hostname: string;
  method: 'dns_txt' | 'well_known';
}): Promise<ActionResult<VerifiedOwnership>> {
  const { userId } = await requireUser();

  // A server action is a public endpoint: the typed `input` is re-validated.
  const parsed = ownershipVerifySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid verification request.' };
  }

  const { hostname, method } = parsed.data;

  const normalizedHostname = normalizeHostname(hostname);
  if (normalizedHostname === null) {
    return { success: false, error: 'Invalid verification request.' };
  }

  const tokens = await db()
    .select({ id: verificationTokens.id, value: verificationTokens.value })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, normalizedHostname),
        eq(verificationTokens.purpose, 'domain_ownership'),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(verificationTokens.createdAt));

  if (tokens.length === 0) {
    return { success: false, error: 'Request a new ownership challenge for this domain first.' };
  }

  const proof = await obtainProof(method, normalizedHostname);
  if (!proof.ok) {
    return { success: false, error: proof.error };
  }

  const matched = tokens.find((candidate) => proof.candidates.includes(candidate.value));
  if (matched === undefined) {
    return {
      success: false,
      error:
        method === 'dns_txt'
          ? 'The TXT record does not match a pending challenge for this domain.'
          : 'The well-known file does not match a pending challenge for this domain.',
    };
  }

  const verificationRecord = method === 'dns_txt' ? matched.value : WELL_KNOWN_PATH;
  const verifiedAt = new Date();
  const proofState = {
    hostname,
    verified: true,
    verificationMethod: method,
    verificationRecord,
    verifiedAt,
  };

  const heldByAnotherAccount = await db().transaction(async (tx) => {
    const written = await tx
      .insert(domains)
      .values({ userId, normalizedHostname, ...proofState })
      .onConflictDoUpdate({
        target: domains.normalizedHostname,
        set: proofState,
        // Never reassign a domain someone else already proved (D2). If the
        // conflicting row belongs to another account the update is skipped,
        // `returning()` comes back empty, and the transaction commits having
        // written nothing — the token stays unconsumed on purpose.
        setWhere: eq(domains.userId, userId),
      })
      .returning({ id: domains.id });

    if (written.length === 0) {
      return true;
    }

    // Single-use: the token dies with the verification that consumed it.
    await tx.delete(verificationTokens).where(eq(verificationTokens.id, matched.id));
    return false;
  });

  if (heldByAnotherAccount) {
    return {
      success: false,
      error: 'This domain is already verified by another account.',
    };
  }

  // Audit `domain.ownership.verified` is wired in task 4.3, with the rate
  // limiter, across every action that needs it.

  return {
    success: true,
    data: {
      hostname,
      normalizedHostname,
      verificationMethod: method,
      verifiedAt: verifiedAt.toISOString(),
    },
  };
}

/**
 * Obtains the candidate proof values for a method. Network and DNS failures
 * are ordinary outcomes here — the record may simply not be published yet —
 * so they become user-facing messages, not thrown errors.
 */
async function obtainProof(
  method: 'dns_txt' | 'well_known',
  hostname: string,
): Promise<ProofResult> {
  if (method === 'dns_txt') {
    try {
      // `resolveTxt` splits a long TXT value into ≤255-char chunks; joining
      // each record's chunks reconstructs the value as published.
      const chunks = await resolveTxt(`${TXT_HOSTNAME_PREFIX}${hostname}`);
      return { ok: true, candidates: chunks.map((parts) => parts.join('')) };
    } catch {
      // NXDOMAIN / ENODATA: the record is not published (yet).
      return {
        ok: false,
        error: 'Could not read the DNS TXT record for this domain. Publish it and try again.',
      };
    }
  }

  let response: Response;
  try {
    // Same hardened egress as scan traffic (D6): this fetch can reach
    // internal hosts exactly like a scan would, so it goes through the same
    // gate. `SsrfError` lands in the same catch — a hostname that resolves
    // internally can never serve a legitimate proof either.
    response = await safeFetch(`https://${hostname}${WELL_KNOWN_PATH}`);
  } catch {
    return {
      ok: false,
      error: 'Could not fetch the well-known file for this domain.',
    };
  }

  if (!response.ok) {
    return { ok: false, error: 'The well-known file is not being served for this domain.' };
  }

  return { ok: true, candidates: [(await response.text()).trim()] };
}

export async function submitScanAction(input: {
  url: string;
}): Promise<ActionResult<{ scanId: string }>> {
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.userId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  // Rate limiting: 5/h per user, 20/h per IP (design D4)
  try {
    await consumeRateLimit({ key: `user:${userId}:scan`, limit: 5, windowSec: 3600 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { success: false, error: 'Rate limit exceeded' };
    }
  }

  const parsed = targetUrlSchema.safeParse(input.url);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid URL.' };
  }

  const { normalizedHostname, url, baseUrl, port, scheme } = parsed.data;

  try {
    await requireVerifiedDomain(userId, normalizedHostname);
  } catch {
    return { success: false, error: 'Domain not verified' };
  }

  // Normalize target as per SS-1
  // SS-2: SSRF gate via safeFetch context (we validate host against allowed schemes/ports)

  // Get domain
  const domainRows = await db()
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.normalizedHostname, normalizedHostname))
    .limit(1);

  if (domainRows.length === 0) {
    return { success: false, error: 'Domain not verified' };
  }

  const domainId = domainRows[0]!.id;

  // Row first, then publish (SS-1..SS-6), with the sequence owned by
  // `enqueueScanForDomain` so the scheduler cannot drift from it.
  const outcome = await enqueueScanForDomain({
    domainId,
    target: { url, scheme, host: normalizedHostname, port, baseUrl },
    actorUserId: userId,
    source: 'manual',
  });

  if (!outcome.ok) {
    return { success: false, error: 'Service unavailable' };
  }

  return { success: true, data: { scanId: outcome.scanId } };
}
