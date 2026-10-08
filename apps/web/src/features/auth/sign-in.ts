import 'server-only';

import { APIError } from 'better-auth';

import { getAuth } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';

/**
 * Signs in and reports the outcome as a value, never as an exception.
 *
 * ## WHY THIS EXISTS — READ BEFORE SIMPLIFYING IT AWAY
 *
 * Better Auth's server API THROWS on bad credentials. Verified in the installed
 * package, `dist/api/routes/sign-in.mjs`: three separate branches raise
 * `APIError.from("UNAUTHORIZED", INVALID_EMAIL_OR_PASSWORD)`. It does not return
 * a falsy result and it does not return an error field.
 *
 * So calling `getAuth().api.signInEmail(...)` and testing `if (!result?.user?.id)`
 * is not a defensive check that occasionally triggers — it is a branch that can
 * NEVER be taken. Two real bugs followed from that, both of which this wrapper
 * exists to prevent:
 *
 *   1. In `loginAction`, a wrong password threw straight out of the Server
 *      Action, so `recordFailure` was unreachable. The lockout ladder therefore
 *      never advanced for any failed attempt, and the page rendered the global
 *      error boundary instead of the generic message. Unlimited password guessing.
 *
 *   2. In `registerAction`, a duplicate address with a wrong password threw,
 *      while a brand-new address redirected cleanly. The two cases became
 *      distinguishable again — reinstating exactly the account-enumeration
 *      oracle the surrounding comments describe at length.
 *
 * Only `APIError` is absorbed. Anything else is re-thrown on purpose: a database
 * that is down or an adapter fault must surface as a real error rather than being
 * reported to the user as "wrong password", which would hide an outage behind a
 * plausible message and send everyone looking in the wrong place.
 */
export type SignInOutcome = { ok: true; userId: string } | { ok: false };

export async function signInEmailSafe(
  email: string,
  password: string,
  requestHeaders: Headers,
): Promise<SignInOutcome> {
  try {
    const result = await getAuth().api.signInEmail({
      body: { email, password },
      headers: requestHeaders,
    });

    const userId = result?.user?.id;
    return userId ? { ok: true, userId } : { ok: false };
  } catch (error) {
    if (error instanceof APIError) {
      return { ok: false };
    }
    throw error;
  }
}

/**
 * Burns the same argon2 work as a real verification, so an unknown address is not
 * measurably faster than a wrong password.
 *
 * The decoy hash is of a random value generated once per process, so it is never
 * a valid hash for anything — it cannot become a backdoor, and it is not a secret
 * from anyone except the attacker timing this function.
 *
 * Generated LAZILY and memoised. Hashing on every unknown-address attempt would
 * add 19 MiB of allocation to an *unauthenticated* request purely to fake work,
 * which is exactly the amplification this is supposed to avoid.
 */
let decoyHashPromise: Promise<string> | undefined;

function decoyHash(): Promise<string> {
  decoyHashPromise ??= hashPassword(crypto.randomUUID());
  return decoyHashPromise;
}

export async function verifyAgainstDecoy(password: string): Promise<void> {
  try {
    await verifyPassword({ hash: await decoyHash(), password });
  } catch {
    // Never let the decoy become an error path.
  }
}
