import { z } from 'zod';

/**
 * Auth input schemas.
 *
 * Zod runs BEFORE any database or `auth.api.*` call. The reason is not elegance:
 *
 *   - argon2id costs ~19 MiB and two passes **per hash**. Validating after the
 *     hash means an unauthenticated caller can make the server spend memory on
 *     input that was never going to be used. Validation first is the cheapest
 *     rate limit there is.
 *   - a zod error message is precise; a database constraint violation is a 500
 *     that has to be reverse-engineered from a stack trace.
 *
 * Every action re-parses with the SAME schema on the server side. Client-side
 * validation is a convenience for the user's feedback loop; the server-side
 * check is the security boundary, and it is the one that counts.
 */

/**
 * 12 characters minimum — OWASP ASVS 2.1.1 / NIST SP 800-63B.
 *
 * Composition rules ("one uppercase, one symbol") are deliberately NOT imposed.
 * The guidance rejects them: they are predictable, they push users toward
 * `Password1!`, and they are trivially defeated by any attacker who can run a
 * dictionary that already satisfies the rules. Length is the property that
 * actually raises the cost of guessing.
 *
 * 128 maximum. RFC 9101 treats over-long inputs to a memory-hard hash as a cheap
 * denial-of-service amplifier: the attacker pays nothing to send a megabyte into
 * a function that allocates per attempt.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(320, 'Email is too long.') // RFC 5321 path limit
  // Deliberately permissive. A strict RFC 5322 regex rejects valid addresses and
  // buys nothing: a syntactically odd address is not an attack, and the only
  // addresses that matter for existence are the ones that resolve to a mailbox.
  .email('Enter a valid email address.');

/**
 * Lowercased for lookup.
 *
 * `users.email` is `citext`, so storage and matching are case-insensitive at the
 * database level and `citext` compares with the column's collation — not with
 * JavaScript's, which has no notion of case folding at all. Trimming is what
 * actually matters: a trailing space from a paste would otherwise produce an
 * address that matches nothing.
 */
const normalizedEmail = emailSchema.transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Use at least ${MIN_PASSWORD_LENGTH} characters. Length beats complexity rules.`,
  )
  .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters.`)
  // No complexity rules, deliberately. See the note above.
  .refine((value) => value.trim().length > 0, 'Password cannot be only spaces.');

/**
 * A display name is optional. Email-only signup must not demand a name; demanding
 * it measurably increases signup abandonment, and an account does not become more
 * secure by having a name attached.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name cannot be empty.')
  .max(120, 'Name is too long.')
  .optional();

export const registerSchema = z.object({
  email: normalizedEmail,
  password: passwordSchema,
  name: nameSchema,
});
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterValues = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1, 'Password is required.').max(MAX_PASSWORD_LENGTH),
});
export type LoginInput = z.input<typeof loginSchema>;
export type LoginValues = z.output<typeof loginSchema>;

/**
 * Registration failures get a generic message, for the same reason login does:
 *
 *   - "That email is already registered" confirms to an attacker that the address
 *     is an account here, which is the first half of a credential-stuffing list;
 *   - but silently absorbing a genuine duplicate is a worse product.
 *
 * Resolution: the message is generic, and the flow **continues as if it
 * succeeded** — see `actions.ts`, which signs the user in on a duplicate
 * registration when the supplied password happens to match. That is the only way
 * to keep both properties: the user is not confused, and the attacker learns
 * nothing, because the observable behaviour is identical in both cases.
 */
export const GENERIC_AUTH_ERROR =
  'We could not sign you in with those details. Check the email and password and try again.';

export const GENERIC_REGISTER_ERROR =
  'We could not create that account. If the address is already registered, try signing in instead.';
