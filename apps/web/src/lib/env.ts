import 'server-only';

import { z } from 'zod';

/**
 * Centralised, validated environment access.
 *
 * RULE: nothing else in this app reads `process.env` directly. `src/lib/env.ts`
 * is the only module allowed to, so the set of variables the application depends
 * on is one readable list rather than a grep across every file. The root
 * `.env.example` is the single source of truth for names; this file is the
 * single source of truth for *validity*.
 *
 * ## Why validation is LAZY, not at module scope
 *
 * The obvious implementation parses at import time:
 *
 * ```ts
 * export const env = schema.parse(process.env);   // <-- WRONG here
 * ```
 *
 * That throws during `next build`, because Next evaluates the module graph of
 * every route while collecting page data. A build would then require a populated
 * `.env` and a reachable database — so CI could not build without production
 * credentials, and a developer could not build before starting Postgres.
 *
 * Parsing is therefore memoised on FIRST ACCESS, which happens on the first
 * request. The requirement "fail loudly on missing or invalid values at server
 * start" is met where it is actually meaningful: **before any request is
 * served**, a misconfigured deployment throws with the offending variable named,
 * rather than failing later with an opaque auth error. A build is a compile
 * step, not a server start, and conflating the two is what makes a build
 * environment-dependent.
 */

/**
 * `AUTH_SECRET` minimum length.
 *
 * 32 bytes is the floor from the Better Auth documentation, and it is the right
 * floor: the secret signs session cookies, so its length is the entropy an
 * attacker must guess to forge one. A 16-character secret is not "a bit weaker",
 * it is within reach of commodity hardware.
 *
 * `.min(32)` counts JavaScript string length, so a 32-character base64 string
 * carries ~192 bits of the 256 that `openssl rand -base64 32` produces. That is
 * the correct direction to be wrong in.
 */
const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Accepts `postgres:` and `postgresql:` only.
 *
 * The check is on SCHEME, never on host. Matching a host would be exactly the
 * provider awareness ADR 0004 forbids — and worse, it would break the day the
 * owner chooses Supabase, because the validation would reject the one URL that
 * is correct.
 */
const databaseUrlSchema = z
  .string()
  .min(1, 'DATABASE_URL must not be empty')
  .refine((value) => /^postgres(ql)?:\/\//i.test(value), {
    message:
      'DATABASE_URL must be a postgres:// or postgresql:// connection string. ' +
      'There is no default host: the data layer is provider-neutral (ADR 0004).',
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** PostgreSQL connection string. Provider-neutral by design. */
  DATABASE_URL: databaseUrlSchema,

  /** Session cookie signing secret. Never logged, never returned to a client. */
  AUTH_SECRET: z
    .string()
    .min(
      MIN_AUTH_SECRET_LENGTH,
      `AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 32`,
    ),

  /** Public origin of this deployment. Used for callback URLs. */
  AUTH_URL: z.string().url('AUTH_URL must be an absolute URL, e.g. http://localhost:3000'),

  /**
   * Browser-visible origin. Optional because it has a sane fallback to
   * `AUTH_URL`; the two being different is a legitimate setup (a proxy that
   * rewrites the public host, for example).
   */
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be an absolute URL').optional(),

  /** Dev mail. Consumed by the Sprint 2 mailer; declared now to fix the contract. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  EMAIL_FROM: z.string().optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Returns the validated environment, parsing on first access.
 *
 * Throws with the full list of problems rather than the first one. Fixing
 * misconfiguration one round-trip at a time is a waste of a developer's time,
 * and a zod schema already knows every failure.
 */
export function getEnv(): Env {
  if (cached !== null) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      'Invalid environment configuration. Nothing else in this app reads ' +
        'process.env, so these are all of the problems:\n\n' +
        `${problems}\n\n` +
        'Copy the repository root .env.example to .env and fill in the blanks. ' +
        'AUTH_SECRET must be generated with: openssl rand -base64 32',
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Resets the memoised environment. Tests only — there is no reason for
 * production code to re-read `process.env` after boot, and allowing it would let
 * a value change underneath a long-lived handle.
 */
export function resetEnvForTesting(): void {
  cached = null;
}

/** True when running a production build. Used to hide dev-only UI. */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}
