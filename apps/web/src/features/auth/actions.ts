'use server';

import { eq, users } from '@vuldetected/db';
import { redirect } from 'next/navigation';

import { audit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { consumeRateLimit, RateLimitError } from '@/lib/rate-limit';

import { activeLockMinutes, clearExpiredLock, recordFailure, resetFailures } from './lockout';
import { authHeaders, requestIp } from './request';
import { GENERIC_AUTH_ERROR, loginSchema, registerSchema } from './schema';
import { signInEmailSafe, verifyAgainstDecoy } from './sign-in';

/**
 * Where an authenticated user lands.
 *
 * A constant, not a value taken from the request. Honouring a `?next=` parameter
 * turns the login page into an open redirect: an attacker sends a link to
 * `/login?next=https://evil.example`, the user signs in on a real origin, and is
 * forwarded somewhere that looks legitimate because it immediately followed a
 * genuine login. Fixing the destination removes the whole class.
 */
const POST_AUTH_PATH = '/dashboard';

/**
 * New accounts allowed from one IP per hour.
 *
 * A named constant rather than a literal because the number is a product
 * decision and the comment explaining it lives next to the check that uses it.
 */
const REGISTER_IP_LIMIT = 5;

/**
 * Where a successful registration lands.
 *
 * `/login`, not `/dashboard`: `autoSignIn` is off (see `lib/auth.ts`), so no
 * session cookie exists yet and the dashboard would only bounce back here. A
 * duplicate address no longer shares this path — it returns an inline error
 * (CA-02) and the form stays put.
 */
const POST_REGISTRATION_PATH = '/login';

/**
 * Auth server actions.
 *
 * ## Why every action returns `{ error }` instead of throwing
 *
 * A thrown error in a Server Action crosses the client/server boundary and lands
 * in `global-error.tsx` — a full-page crash — which is the wrong response to "you
 * typed the wrong password". Callers get a discriminated result they can render
 * inline, and a genuine fault still reaches the boundary because the forms DO
 * throw on anything unexpected.
 *
 * `ActionResult` is a discriminated union rather than `{ error?: string }` so
 * TypeScript narrows on `result.success` and a success branch cannot accidentally
 * read `result.error`.
 */
export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Maps a Zod failure onto per-field message keys.
 *
 * The schema emits keys from `auth.validation.*` (see `schema.ts`), not copy;
 * the form translates them. Only the FIRST issue per field is surfaced.
 * Rendering three messages under one input is noise, and the first is the
 * actionable one.
 */
function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}

/**
 * Registers an account.
 *
 * An address that already has an account is rejected with a message that says
 * so (CA-02). The reasoning, including what that costs, is on the branch itself.
 */
export async function registerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  /**
   * `FormData.get` returns `''` for a text input the user left blank — it does not
   * return null. So `?? undefined` is not enough here: the empty string reaches
   * the schema, and `name: z.string().trim().min(1).optional()` rejects `''`,
   * which quietly turns the optional field into a required one and contradicts the
   * optional-name comment below. An all-whitespace value is treated the same way,
   * since `.trim()` is applied before the emptiness check.
   */
  const rawName = formData.get('name');
  const submittedName = typeof rawName === 'string' && rawName.trim() !== '' ? rawName : undefined;

  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: submittedName,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'errors.checkFields',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { email, password, name } = parsed.data;
  const ip = await requestIp();
  const requestHeaders = await authHeaders();

  /**
   * Per-IP budget for account creation.
   *
   * Registration writes a row, sends a message, and — since CA-02 — answers "is
   * this address registered?" explicitly. Without a budget, that answer is a
   * free enumeration API; with one, it costs an attacker five addresses per hour
   * per IP.
   *
   * Five, not two: a shared office or university NAT legitimately produces
   * several sign-ups in an afternoon, and throttling a classroom to slow
   * someone who can rent addresses is the wrong trade.
   */
  try {
    await consumeRateLimit({
      key: `register:ip:${ip ?? 'unknown'}`,
      limit: REGISTER_IP_LIMIT,
      windowSec: 3600,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { success: false, error: 'errors.tooManyRequests' };
    }
    throw error;
  }

  /**
   * Better Auth's `signUpEmail` requires a name (`sign-up.mjs:150,219` passes it
   * straight into `createUser`, and its input schema is `name: z.string()`), while
   * the form treats the field as optional. Bridged here rather than by making the
   * column nullable: the user's local part is a reasonable display name, and the
   * alternative was a database column that contradicts the library's contract.
   */
  const displayName = name?.trim() || email.split('@')[0] || email;

  // Decides which branch to take BEFORE calling Better Auth, whose own duplicate
  // response is deliberately generic.
  const existing = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const existingId = existing[0]?.id ?? null;

  if (existingId !== null) {
    /**
     * CA-02: an address that already has an account is rejected, and the message
     * says why.
     *
     * This is the deliberate opposite of the login form, and the asymmetry is the
     * point. Silence here bought enumeration resistance at the price of a real
     * user who typed their address wrong, or who registered months ago, watching
     * the form claim success and then do nothing usable.
     *
     * It also removes a worse problem. The previous implementation absorbed the
     * duplicate by attempting a sign-in with the submitted password —
     * `signInEmailSafe` on an endpoint with no lockout ladder — which made this
     * form an unthrottled password oracle for every registered account. The only
     * budget in front of it was the per-IP limit added above, and a password
     * guess costs an attacker nothing to repeat.
     *
     * The enumeration cost is accepted and bounded: this reveals what `/login`
     * already reveals to anyone who tries, and the per-IP budget turns bulk
     * enumeration into an afternoon of address rotation. Tracked as a documented
     * trade-off in `docs/security.md`.
     */
    return {
      success: false,
      error: 'errors.emailInUse',
    };
  }

  const result = await getAuth().api.signUpEmail({
    body: { email, password, name: displayName },
    headers: requestHeaders,
  });

  if (!result?.user?.id) {
    // A genuine failure (database down, adapter error). Saying so is safe: it
    // reveals nothing about whether the address exists, because this branch is
    // only reachable when the address did NOT exist a moment ago.
    return {
      success: false,
      error: 'errors.createFailed',
    };
  }

  await audit(
    {
      action: 'user.registered',
      actorUserId: result.user.id,
      targetType: 'user',
      targetId: result.user.id,
      metadata: { email },
    },
    ip,
  );

  // To `/login`, not `/dashboard`. `autoSignIn` is off (see `lib/auth.ts`), so no
  // cookie was set — and arriving at `/login` is exactly what the duplicate branch
  // above does. The audit row is written BEFORE the redirect so a navigation
  // cannot cancel it.
  redirect(POST_REGISTRATION_PATH);
}

/**
 * Signs in. *
 * ## USER ENUMERATION
 *
 * The SAME message is returned for an unknown address, a wrong password, a
 * suspended account, and a locked account. Distinguishing them is the single
 * highest-value thing an attacker learns from a login form: "this address is
 * registered here" turns a spray list into a targeted list, and it is what turns
 * a login page into an account-enumeration oracle.
 *
 * ## TIMING
 *
 * An unknown email never reaches the argon2 verify, because there is no hash to
 * verify against. That makes the unknown-address path measurably faster than the
 * wrong-password path, which is a timing side channel that leaks the same fact
 * the message is careful not to.
 *
 * Mitigated below with a constant-work decoy hash: when no account exists, one is
 * verified anyway, so both paths cost the same ~19 MiB and two passes. Not a
 * complete defence — a determined attacker can still average over many samples —
 * but it removes the trivially measurable version of the leak, and the comment
 * here exists so nobody "optimises" it away.
 */
export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'errors.checkFields',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { email, password } = parsed.data;
  const ip = await requestIp();
  const requestHeaders = await authHeaders();

  const found = await db()
    .select({
      id: users.id,
      status: users.status,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const account = found[0];

  if (!account) {
    // Decoy verification: equalise the work done on both branches.
    await verifyAgainstDecoy(password);

    await audit(
      {
        action: 'auth.login_failed',
        targetType: 'user',
        // No actor: an unknown address has no user. `actor_user_id` is nullable
        // for exactly this event.
        metadata: { email, reason: 'unknown_account' },
      },
      ip,
    );

    return { success: false, error: GENERIC_AUTH_ERROR };
  }

  await clearExpiredLock(account.id);

  const lockedMinutes = await activeLockMinutes(email);
  if (lockedMinutes > 0) {
    await audit(
      {
        action: 'auth.login_failed',
        actorUserId: account.id,
        targetType: 'user',
        targetId: account.id,
        metadata: { email, reason: 'locked', lockedMinutes },
      },
      ip,
    );

    // Generic message on purpose. "Try again in 12 minutes" would confirm the
    // address exists; the hint is offered on the login page instead, and only
    // after a real, rate-limited attempt.
    return { success: false, error: GENERIC_AUTH_ERROR };
  }

  if (account.status === 'suspended' || account.status === 'deleted') {
    // Still generic. Confirming "suspended" is as useful to an attacker as
    // confirming "registered".
    await audit(
      {
        action: 'auth.login_failed',
        actorUserId: account.id,
        targetType: 'user',
        targetId: account.id,
        metadata: { email, reason: account.status },
      },
      ip,
    );

    return { success: false, error: GENERIC_AUTH_ERROR };
  }

  const signIn = await signInEmailSafe(email, password, requestHeaders);

  if (!signIn.ok) {
    // Reached by a wrong password, and by nothing else: every other failure mode
    // is either handled above or re-thrown by `signInEmailSafe`.
    await recordFailure(account.id, email, ip);
    return { success: false, error: GENERIC_AUTH_ERROR };
  }

  await resetFailures(account.id);

  await audit(
    {
      action: 'auth.login_succeeded',
      actorUserId: account.id,
      targetType: 'session',
      metadata: { email, userId: account.id },
    },
    ip,
  );

  redirect(POST_AUTH_PATH);
}

/**
 * Ends the session.
 *
 * Redirects on completion. Signing out does not by itself re-render the page the
 * form was submitted from, so without this the user is left sitting on a
 * dashboard they are no longer authenticated for, with the server-rendered shell
 * still showing their name until they navigate. `redirect()` throws, so it must
 * come after the audit write — after a `signOut` there is no session left to
 * attribute the event to, and a cancelled write would lose the actor id.
 */
export async function logoutAction(): Promise<void> {
  const requestHeaders = await authHeaders();

  // Read the session BEFORE revoking it: after sign-out there is nothing left to
  // attribute the event to, so the actor would be lost from the audit row.
  const session = await getAuth().api.getSession({ headers: requestHeaders });

  await getAuth().api.signOut({ headers: requestHeaders });

  await audit({
    action: 'auth.logged_out',
    actorUserId: session?.user?.id ?? null,
    targetType: 'session',
    metadata: { userId: session?.user?.id ?? null },
  });

  redirect(POST_REGISTRATION_PATH);
}
