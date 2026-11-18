/**
 * Maps the `?error=` code Better Auth appends after an OAuth callback to a
 * message key under the `auth` namespace.
 *
 * ## Why a whitelist instead of echoing the code
 *
 * The code arrives in a URL, so it is attacker-controlled text. Rendering it
 * directly would put arbitrary query-string content on the page, and the codes
 * that actually exist are a short, known list. Anything unrecognised falls back
 * to one generic sentence: an unknown failure is still a failure, and a person
 * needs a next step, not a library's internal error slug.
 *
 * The codes are the ones produced by `better-auth`'s OAuth callback
 * (`dist/oauth2/errors.mjs` and the implicit-link gate in
 * `dist/oauth2/link-account.mjs`), which are joined with underscores on the way
 * out — `"account not linked"` arrives as `account_not_linked`.
 */
const ERROR_KEYS: Record<string, string> = {
  // ADR 0016: the provider did not assert the address, or the local account
  // never proved control of the mailbox.
  account_not_linked: 'social.errors.accountNotLinked',
  email_not_verified: 'social.errors.emailNotVerified',
  email_does_not_match: 'social.errors.emailDoesNotMatch',
  account_already_linked_to_different_user: 'social.errors.alreadyLinkedToAnotherUser',
  unable_to_link_account: 'social.errors.unableToLink',
  unable_to_get_user_info: 'social.errors.unableToGetProfile',
  signup_disabled: 'social.errors.signupDisabled',
  // Authorization-session failures: expired, replayed, or missing state.
  state_not_found: 'social.errors.authorizationExpired',
  invalid_callback_request: 'social.errors.authorizationExpired',
  no_code: 'social.errors.authorizationExpired',
};

/**
 * Returns the message key for a callback error, or `undefined` when the request
 * carried no error at all.
 */
export function socialErrorMessageKey(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return ERROR_KEYS[code] ?? 'social.errors.generic';
}
