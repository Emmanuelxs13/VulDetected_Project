import 'server-only';

import { accounts, sessions, users, verificationTokens } from '@vuldetected/db';
import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { db } from './db';
import { getEnv } from './env';
import { hashPassword, verifyPassword } from './password';

/**
 * Better Auth server instance.
 *
 * ## Lazy, and that is load-bearing
 *
 * This is a memoised `getAuth()`, NOT a module-scope `export const auth`.
 * `betterAuth()` reads `secret`, `baseURL`, and — through `databaseHooks` — the
 * database schema at construction. Building it eagerly means `next build`
 * evaluates this module while collecting page data, which would require a
 * populated `.env` and a reachable database to compile the app.
 *
 * The memoisation still gives exactly one instance per process, so cookie
 * signing state and hook identity are stable. A configuration error surfaces on
 * the first request, naming the missing variable, which is a strictly better
 * report than a build failure in CI that says nothing about the real cause.
 *
 * ## Table-name mapping (the important bit)
 *
 * Better Auth expects models named `user`, `session`, `account`, `verification`.
 * Our tables are plural. The adapter's `schema` option is keyed **by Better
 * Auth's model name**, with our Drizzle table as the value — verified against
 * the installed adapter source, where resolution is a plain lookup:
 *
 * ```js
 * function getSchema(model) { const schemaModel = schema[model]; ... }
 * ```
 *
 * (verified in `node_modules/@better-auth/drizzle-adapter/dist/index.mjs`)
 *
 * So plural names are kept deliberately: `users` reads correctly to someone
 * querying with `psql`, and matching the library's table names would buy nothing
 * except easier table lookup by hand.
 *
 * `usePlural` is deliberately NOT set. It exists to make `db.query` key
 * resolution work when a caller passes no schema object; we pass the mapping
 * explicitly, which is the stronger form of the guarantee.
 *
 * ## Column vs property names
 *
 * The adapter maps fields by Drizzle **property** name, so `users` declares
 * `emailVerified` (JS property) over the `email_verified` column. `citext` and
 * every Better Auth field keep the names it expects.
 */
let instance: ReturnType<typeof buildAuth> | null = null;

/** Builds the instance. Split out so its type is inferred rather than annotated. */
function buildAuth() {
  const env = getEnv();

  return betterAuth({
    appName: 'VulDetected',

    baseURL: env.AUTH_URL,
    secret: env.AUTH_SECRET,

    /**
     * TOP LEVEL, not under `advanced`. This placement is load-bearing, and it was
     * wrong at first.
     *
     * Verified in the installed package: `getTrustedOrigins` reads
     * `options.trustedOrigins` (`context/helpers.mjs:76`). Nesting it under
     * `advanced` type-checks without complaint and is then silently ignored at
     * runtime — a config option that looks present and does nothing is worse than
     * one that is obviously absent.
     *
     * Largely redundant, and kept deliberately. `baseURL` as a string already
     * contributes its own origin to the trusted list (`helpers.mjs:73-74`), so
     * this duplicates that single entry. It stays because it keeps the trusted
     * surface explicit exactly where a reader is deciding what is trusted, and
     * because that automatic entry goes away if `baseURL` is ever converted to
     * Better Auth's dynamic form.
     *
     * Note what this does NOT do: it does not make `x-forwarded-for` trustworthy.
     * That is `advanced.trustedProxyHeaders`, configured below. Origin checking
     * and client-IP attribution are different controls, and mistaking a setting for
     * one as if it covered the other is precisely how a spoofable audit log
     * happens.
     */
    trustedOrigins: [env.AUTH_URL],

    database: drizzleAdapter(db(), {
      provider: 'pg',

      /**
       * Keys are Better Auth's model names. Values are our plural tables.
       *
       * `auditLogs` is deliberately NOT here: Better Auth has no model for it, and
       * listing a table it will never address would only suggest otherwise. It is
       * reached through `@vuldetected/db` directly, in `lib/audit.ts`.
       */
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verificationTokens,
      },
    }),

    emailAndPassword: {
      enabled: true,

      /**
       * OFF for Sprint 1.
       *
       * Whether a login must be preceded by a verified address is an open
       * PRODUCT question, not a technical one — see
       * `docs/decisions-pending.md#email-verification-before-first-login`. Turning
       * this on without the owner's answer would lock out accounts on a rule
       * nobody agreed to. It is a one-line change and the schema already carries
       * `email_verified` and `deleted_at`, so the answer costs no migration.
       */
      requireEmailVerification: false,

      /**
       * Minimum length accepted by Better Auth.
       *
       * 12, not Better Auth's default of 8, and not the "three random words"
       * folklore. OWASP ASVS 2.1.1 and the NIST SP 800-63B guidance both reject
       * composition rules ("one uppercase, one symbol") in favour of LENGTH plus
       * a breached-password check, because composition rules are predictable and
       * length is not. 12 is the point past which guessing stops being
       * practical against a rate-limited endpoint.
       *
       * `MAXIMUM_LENGTH: 128` is deliberate, not cosmetic: the RFC 9101 guidance
       * treats inputs above ~72 bytes as a denial-of-service amplifier for
       * memory-hard hashes, since the attacker pays nothing for the extra input.
       */
      minPasswordLength: 12,
      maxPasswordLength: 128,

      /**
       * Registration does NOT sign the new account in.
       *
       * This is a security decision, not a UX preference. With `autoSignIn` on
       * (the default), a fresh registration arrives at `/dashboard` WITH a session
       * cookie while a duplicate registration arrives at `/login` WITHOUT one — two
       * visibly different outcomes for the same submitted form, which turns the
       * registration page into an account-enumeration oracle.
       *
       * Turning it off makes both paths cookie-free and therefore identical. The
       * library independently reaches the same conclusion: with `autoSignIn`
       * false it sets `shouldReturnGenericDuplicateResponse` and hashes the
       * password to equalise timing (`sign-up.mjs:155-156`, `200`).
       *
       * The cost is one extra form submission. That is the right price for not
       * handing out a list of registered addresses.
       */
      autoSignIn: false,

      /**
       * Our argon2id implementation. See `password.ts` for why these parameters
       * and why this package rather than `argon2` or `bcrypt`.
       */
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },

    user: {
      /**
       * Our extra columns, declared so Better Auth knows about them.
       *
       * `input: false` is the important flag on four of these: it means the field
       * is never accepted from a request body. Without it, `signUp.email({...})`
       * could set `status: 'active'` on a fresh account or `lockedUntil` in the
       * past and skip a lockout entirely — a privilege-escalation bug created by
       * forgetting a flag. `failedLoginCount` and `lockedUntil` are written only
       * by the hooks below and by server code.
       *
       * `returned: false` on `lockedUntil` keeps the internal lockout state out
       * of every API response, so it cannot leak into client-visible session data.
       */
      additionalFields: {
        status: {
          type: ['pending', 'active', 'suspended', 'deleted'] as const,
          required: false,
          input: false,
          returned: true,
        },
        locale: {
          type: 'string',
          required: false,
          input: true,
          defaultValue: 'es',
        },
        failedLoginCount: {
          type: 'number',
          required: false,
          input: false,
          returned: false,
        },
        lockedUntil: {
          type: 'date',
          required: false,
          input: false,
          returned: false,
        },
        deletedAt: {
          type: 'date',
          required: false,
          input: false,
          returned: false,
        },
      },
    },

    session: {
      /**
       * Seven days. A `remember-me` checkbox halves it to one day
       * (`dontRememberMe`).
       *
       * Absolute, not sliding. A sliding window means a stolen cookie that keeps
       * being presented never expires, which removes the property that makes
       * cookie theft survivable — the session ends on its own if nobody notices.
       */
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24, // touch at most daily, to keep `updated_at` honest

      /**
       * Fresh-age gate: a session older than this does not satisfy operations
       * Better Auth classifies as sensitive — changing a password, revoking other
       * sessions, enabling 2FA — without re-entering credentials.
       *
       * 15 minutes. This previously read `60 * 30`, which is 1800 seconds, while
       * the comment beside it claimed 30 seconds: a factor of sixty between what
       * the code did and what it claimed. Two ways to be wrong there, and the
       * units make it easy to reintroduce, so the value is written out.
       *
       * A short freshness window is not free — it is a deliberate trade of friction
       * against the value of a session cookie stolen with a long tail. It also has
       * NO consumer in Sprint 1, because none of those sensitive flows are wired
       * yet, so this setting is currently inert and the real requirement has not
       * been decided. Tracked in `docs/decisions-pending.md`; revisit it when the
       * first sensitive operation lands, not before.
       */
      freshAge: 60 * 15,
    },

    advanced: {
      /**
       * WHY `"uuid"` AND NOT A CUSTOM FUNCTION.
       *
       * Our primary keys are `uuid DEFAULT gen_random_uuid()`. Better Auth's
       * default id generator produces a 32-character alphanumeric string, which
       * Postgres would reject for a `uuid` column — every signup would 500.
       *
       * Reading the installed core (`db/adapter/get-id-field.mjs`):
       *
       * ```js
       * const useUUIDs = options.advanced?.database?.generateId === "uuid";
       * const shouldGenerateId = useUUIDs ? !supportsUUIDs : true;
       * ```
       *
       * The Drizzle adapter reports `supportsUUIDs: provider === "pg"`, i.e.
       * `true`. So `shouldGenerateId` becomes `false`: Better Auth omits `id`
       * from the INSERT and lets the **database default** supply the UUID. That
       * is exactly the design in `docs/database.md`, with the authority for the
       * value sitting in Postgres where a uniqueness constraint can enforce it.
       */
      database: {
        generateId: 'uuid',
      },

      /**
       * Cookie flags. ADR 0002.
       *
       * `secure` is derived from the URL's scheme rather than hardcoded `true`,
       * because `http://localhost` is not a secure context and a hardcoded
       * `Secure` cookie is silently DROPPED by the browser on `http://localhost`
       * — which looks exactly like a broken login, in development only, which is
       * the worst possible place to debug it.
       */
      cookies: {
        sessionToken: {
          name: 'vuldetected.session_token',
          httpOnly: true,
          sameSite: 'lax',
          secure: env.AUTH_URL.startsWith('https://'),
          path: '/',
        },
      },

      /**
       * Trust no proxy's word about the client address unless the proxy is on our
       * own infrastructure. `x-forwarded-for` is attacker-controlled the moment the
       * app is reachable directly, and that header feeds `audit_logs.ip` — a
       * spoofable audit log is worse than no audit log, because it looks
       * authoritative.
       *
       * This is the option that actually governs it, and it is the one that was
       * missing while a `trustedOrigins` key sat here doing something else. Its
       * default is already `false`
       * (`resolveDynamicTrustedProxyHeaders`, `context/helpers.mjs:107-108`), so
       * this is documentation with teeth: set it to `true` only once a specific
       * proxy is known to be in front of the app and the hop count is known.
       *
       * Until then, `requestIp()` in the auth actions reads `x-forwarded-for`
       * directly and is therefore UNVERIFIED. That is acceptable for Sprint 1 only
       * because those rows are explicitly recorded as non-security telemetry —
       * see `lib/audit.ts` and the finding in `docs/security.md`. The moment a row
       * in `audit_logs` is treated as evidence of anything, this stops being
       * acceptable.
       */
      trustedProxyHeaders: false,
    },

    /**
     * Account-state gate.
     *
     * Runs BEFORE the session row is persisted, which is the only point at which
     * refusing is meaningful: after the insert, the cookie already exists.
     *
     * Three refusals:
     *   - `suspended` / `deleted` — an account can be revoked without deleting
     *     the user row, and without this hook a suspension would revoke nothing;
     *   - an unexpired `lockedUntil` — this is where the `failed_login_count` /
     *     `locked_until` pair actually takes effect.
     *
     * The message is deliberately identical for every refusal. A distinct
     * "your account is suspended" reveals that the address is registered, which is
     * the user-enumeration leak the generic login error exists to prevent.
     */
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            // `db()` is called inside the hook, not captured at module scope: this
            // function only ever runs inside a request, so resolving the pool here
            // costs nothing and keeps it out of the build's module evaluation.
            const handle = db();
            const user = await handle.query.users.findFirst({
              where: (fields, operators) => operators.eq(fields.id, session.userId),
              columns: { status: true, lockedUntil: true },
            });

            const unavailable = () =>
              new APIError('FORBIDDEN', {
                message: 'Account not available.',
                code: 'ACCOUNT_UNAVAILABLE',
              });

            if (!user) {
              throw unavailable();
            }

            if (user.status === 'suspended' || user.status === 'deleted') {
              throw unavailable();
            }

            if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
              throw unavailable();
            }
          },
        },
      },
    },

    /**
     * Do not attempt to email anything.
     *
     * Sprint 1 has no mailer. Without this, Better Auth's `sendVerificationEmail`
     * throws at runtime on any signup path that touches it, and the failure
     * surfaces as a 500 in the middle of a flow the user cannot retry. Mail
     * arrives in Sprint 2, via Mailpit locally — see
     * `docs/decisions-pending.md`.
     */
    emailVerification: {
      sendOnSignUp: false,

      /**
       * Hash the `identifier` column. Free, and it defaults the other way.
       *
       * Verified in the installed source: `createVerificationValue` runs
       * `processIdentifier(data.identifier, options.verification?.storeIdentifier)`
       * and the option's documented default is `"plain"`
       * (`internal-adapter.mjs:701`, `@better-auth/core` `init-options.d.mts:1203`).
       * So the address was going to be stored in the clear. The lookup path
       * applies the same transform to the incoming identifier
       * (`findVerificationValue`), which is what makes this safe to turn on: write
       * and read hash identically, so a hashed row is still findable.
       *
       * ## WHAT THIS DOES NOT COVER
       *
       * `verification_tokens.value` is still stored raw. `createVerificationValue`
       * hashes the identifier only and spreads the rest of `data` through
       * untouched — there is no core option for the token value. (A `storeToken`
       * option exists, but it belongs to the magic-link *plugin*, not to core
       * email verification, and wiring it would mean adopting a plugin Sprint 1
       * does not use.)
       *
       * This is accepted because the table is currently INERT: `sendOnSignUp` is
       * false and Sprint 1 has no mailer, so nothing writes a verification row.
       * The gap becomes live the moment mail arrives in Sprint 2, so it must be
       * resolved then — before the first verification email is sent, not after.
       * Tracked in `docs/security.md`.
       */
      storeIdentifier: 'hashed',
    },

    /**
     * `nextCookies()` — REQUIRED, and the failure it prevents is silent.
     *
     * Verified in the installed source
     * (`dist/integrations/next-js.mjs`): this plugin copies `Set-Cookie` out of
     * Better Auth's response and into Next's `cookies()` store.
     *
     * `auth.api.signInEmail()` inside a Server Action does not receive a
     * `Response` object — Next owns the response — so the `Set-Cookie` header
     * that would have carried the session is dropped on the floor. Sign-in then
     * "works": the action succeeds, no error appears, and the next request has no
     * cookie, so the user is bounced straight back to the login form.
     *
     * That is the worst possible bug shape: no exception, no log line, and a
     * report that says "login is broken" with nothing to grep for.
     */
    plugins: [nextCookies()],
  });
}

export function getAuth(): ReturnType<typeof buildAuth> {
  return (instance ??= buildAuth());
}

/** Exposed so the API route can mount the handler without reaching into internals. */
export type Auth = ReturnType<typeof getAuth>;
