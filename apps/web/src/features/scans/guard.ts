import { and, domains, eq } from '@vuldetected/db';

import { db } from '@/lib/db';

import { normalizeHostname } from './schema';

/**
 * Thrown when the enqueue path reaches for a domain the user has not proven
 * they own (DO-1). Callers — `submitScanAction` in task 4.2 — catch it and
 * turn it into an `ActionResult` the UI can render.
 */
export class DomainNotVerifiedError extends Error {
  readonly hostname: string;

  constructor(hostname: string) {
    super(`Domain ownership is not verified for "${hostname}".`);
    this.name = 'DomainNotVerifiedError';
    this.hostname = hostname;
  }
}

/**
 * The structural ownership gate (DO-1, DO-5, design D5 step 5): every enqueue
 * goes through this lookup, and the lookup only ever matches a row that is
 * verified — there is no code path that can queue a scan for a hostname this
 * function refuses.
 *
 * ## Why this lives outside the `'use server'` module
 *
 * Every runtime export of a `'use server'` file becomes a client-callable
 * endpoint. Exporting the guard from `actions.ts` would hand any visitor a
 * "does user X own domain Y" oracle over the network. As a plain server
 * module it is reachable only from code that runs inside the app.
 *
 * ## Failure modes
 *
 * An unparseable hostname throws the same {@link DomainNotVerifiedError} as an
 * unverified one: a value that can never be normalised can never have been
 * verified either, and distinguishing the two would tell an attacker which
 * part of their input got as far as the database.
 */
export async function requireVerifiedDomain(
  userId: string,
  hostname: string,
): Promise<{ domainId: string; normalizedHostname: string }> {
  const normalizedHostname = normalizeHostname(hostname);

  if (normalizedHostname === null) {
    throw new DomainNotVerifiedError(hostname);
  }

  const rows = await db()
    .select({ id: domains.id })
    .from(domains)
    .where(
      and(
        eq(domains.userId, userId),
        eq(domains.normalizedHostname, normalizedHostname),
        eq(domains.verified, true),
      ),
    )
    .limit(1);

  const row = rows[0];

  if (row === undefined) {
    throw new DomainNotVerifiedError(normalizedHostname);
  }

  return { domainId: row.id, normalizedHostname };
}
