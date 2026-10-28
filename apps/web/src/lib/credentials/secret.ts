import { z } from 'zod';

/**
 * The plaintext of a scan credential, and the shape the worker consumes.
 *
 * ## Why the payload is validated rather than passed through
 *
 * The ciphertext is opaque to the database, so nothing else in the stack will
 * ever look inside it. That makes this schema the ONLY place where a stored
 * credential is checked, and it runs twice: once when the user saves it, and
 * again after decryption, because a row sealed by an older version of this code
 * (or by a future one) must not be trusted just because it authenticates.
 *
 * ## Why `header` has a deny list
 *
 * The scanner sets these headers on every request. `Host` and `Content-Length`
 * describe the request the HTTP client is building, so overriding them does not
 * authenticate anything — it corrupts the request in ways that look like a
 * scanner bug. `Connection`, `Transfer-Encoding` and `Upgrade` do the same at the
 * framing layer. A newline anywhere would split the request, which is why the
 * name is a token and the value rejects CR and LF explicitly.
 */

export const CREDENTIAL_KINDS = ['basic', 'bearer', 'header'] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

/** RFC 7230 `token`: the only character set a header name may use. */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Headers the scanner's own HTTP client must keep control of.
 *
 * Compared lower-cased, because header names are case-insensitive and
 * `Content-Length` is the spelling an attacker would try first.
 */
const RESERVED_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'te',
  'transfer-encoding',
  'upgrade',
]);

const headerNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    HEADER_NAME_PATTERN,
    'Header name must be an HTTP token (letters, digits and !#$%&*+-.^_`|~).',
  )
  .refine((name) => !RESERVED_HEADERS.has(name.toLowerCase()), {
    message: 'That header is owned by the HTTP client and cannot be set as a credential.',
  });

/**
 * Header values reject CR and LF instead of stripping them. Stripping would
 * accept `X-Api-Key: secret\r\nX-Admin: true`, silently send something different
 * from what the user typed, and hide the attempt.
 */
const headerValueSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes('\r') && !value.includes('\n'), {
    message: 'Header value must not contain line breaks.',
  });

export const credentialSecretSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('basic'),
    username: z.string().min(1).max(256),
    password: z.string().min(1).max(1024),
  }),
  z.strictObject({
    kind: z.literal('bearer'),
    token: z.string().min(1).max(4096),
  }),
  z.strictObject({
    kind: z.literal('header'),
    headerName: headerNameSchema,
    headerValue: headerValueSchema,
  }),
]);

export type CredentialSecret = z.infer<typeof credentialSecretSchema>;

export const saveCredentialSchema = z.strictObject({
  domainId: z.uuid(),
  label: z.string().trim().min(1).max(80),
  secret: credentialSecretSchema,
});

export type SaveCredentialInput = z.infer<typeof saveCredentialSchema>;

export class CredentialSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialSecretError';
  }
}

/**
 * The object the Python worker's `_auth_headers` reads.
 *
 * Field names are camelCase because that is what `tasks.py` reads
 * (`headerName`, `headerValue`); the conversion is written twice — here and in
 * Python — on purpose, so neither side has to trust the other's spelling.
 */
export type WorkerCredentialPayload = CredentialSecret;

/**
 * Serialises a validated secret for sealing.
 *
 * The kind is part of the sealed payload as well as a column. The column is what
 * the UI queries; the copy inside the ciphertext is what proves the row was not
 * written by a version of this code that disagreed about what the column means.
 */
export function serializeCredentialSecret(secret: CredentialSecret): string {
  return JSON.stringify(secret);
}

/**
 * Parses and validates a decrypted payload.
 *
 * Throws `CredentialSecretError` for a payload that authenticates but is not a
 * credential this build understands — a stricter answer than defaulting fields,
 * because a partially-understood credential would authenticate some requests and
 * silently fail others.
 */
export function parseCredentialSecret(plaintext: string, expectedKind: string): CredentialSecret {
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext);
  } catch {
    throw new CredentialSecretError('Credential payload is not valid JSON.');
  }

  const parsed = credentialSecretSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CredentialSecretError(
      `Credential payload is invalid (${issue?.path.join('.') || 'root'}: ${issue?.message ?? 'unknown'}).`,
    );
  }

  if (parsed.data.kind !== expectedKind) {
    throw new CredentialSecretError(
      `Credential payload is a ${parsed.data.kind} secret but the row says ${expectedKind}.`,
    );
  }

  return parsed.data;
}
