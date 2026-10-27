'use server';

import { eq, users } from '@vuldetected/db';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { ActionResult } from '@/features/auth/actions';
import { audit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { consumeRateLimit, RateLimitError } from '@/lib/rate-limit';

import { requestIp } from './request';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './schema';

/**
 * Password reset, end to end.
 *
 * ## Why these are not in `actions.ts`
 *
 * `actions.ts` owns registration and login. Reset has its own threat model (an
 * unauthenticated endpoint that mails a token to an arbitrary address) and its
 * own rule: **every** outcome reports success. Keeping it in a separate module
 * makes that rule impossible to miss, and lets the "never reveal whether an
 * address exists" test target one file.
 */

const emailOnlySchema = z.object({
  email: z.string().trim().min(1, 'validation.emailRequired').max(320).email('validation.emailInvalid'),
});

const resetSchema = z
  .object({
    token: z.string().trim().min(1, 'validation.resetTokenRequired'),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, 'validation.passwordMin')
      .max(MAX_PASSWORD_LENGTH, 'validation.passwordMax'),
    confirmPassword: z.string().min(1, 'validation.passwordRequired'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

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
 * Requests a reset link.
 *
 * Returns success for an unknown address, an existing address, and an address
 * the rate limiter refused to mail — the three cases are indistinguishable on
 * purpose. Anything else would turn this form into the enumeration oracle the
 * login form is careful not to be.
 *
 * The one visible failure is the per-IP rate limit, which is a property of the
 * caller and not of the address, so it reveals nothing about the account.
 */
export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return {
      success: false,
      error: 'errors.checkFields',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const email = parsed.data.email.toLowerCase();
  const ip = await requestIp();

  try {
    // Two budgets: one per address (a victim must not be flooded) and one per
    // caller (one IP must not be able to spray a list).
    await consumeRateLimit({ key: `reset:email:${email}`, limit: 3, windowSec: 3600 });
    await consumeRateLimit({ key: `reset:ip:${ip ?? 'unknown'}`, limit: 10, windowSec: 3600 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { success: false, error: 'errors.tooManyRequests' };
    }
    throw error;
  }

  const found = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const account = found[0];

  if (account !== undefined) {
    await audit(
      {
        action: 'password_reset.requested',
        actorUserId: account.id,
        targetType: 'user',
        targetId: account.id,
      },
      ip,
    );

    /**
     * `redirectTo` is an absolute path, never a URL from the request. Better
     * Auth appends `?token=` to it, and a caller-controlled value here would be
     * an open redirect that also leaks the token to the attacker's host.
     */
    await getAuth().api.requestPasswordReset({
      body: { email, redirectTo: '/reset-password' },
    });
  }

  return { success: true, data: undefined };
}

/**
 * Consumes a reset token and sets the new password.
 *
 * The token is the credential; the session it produces is not. Better Auth
 * consumes the token, rewrites the hash, and — because
 * `revokeSessionsOnPasswordReset` is on in `lib/auth.ts` — deletes every session
 * the account already had, so a reset actually evicts whoever knew the old
 * password. The user is then sent to the login form to authenticate with the
 * password they just chose; this action never signs them in.
 */
export async function resetPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: 'errors.checkFields',
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { token, password } = parsed.data;

  try {
    await getAuth().api.resetPassword({ body: { newPassword: password, token } });
  } catch {
    /**
     * Expired, already used, and fabricated tokens are one answer. The reason is
     * not the user's business and telling them apart would confirm that a token
     * once existed.
     */
    return { success: false, error: 'errors.resetTokenInvalid' };
  }

  await audit({ action: 'password_reset.completed', targetType: 'verification' });

  // `redirect()` throws its control-flow signal, so it comes after the audit row.
  redirect('/login?reset=1');
}
