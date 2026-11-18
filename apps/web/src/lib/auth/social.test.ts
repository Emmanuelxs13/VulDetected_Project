import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_LINKING_POLICY,
  resolveSocialSetupFromEnv,
  type SocialEnv,
} from './social';
import { socialErrorMessageKey } from './social-errors';

/**
 * HU-02a (SCRUM-28) — social sign-in.
 *
 * These are the decisions that can be checked without a browser: which provider
 * is registered, against which endpoints, with which linking policy, and what the
 * user is told when a callback is refused. The flow itself (a real authorization
 * code exchange, a session cookie, a sign-out and a second sign-in) is exercised
 * end to end in `e2e/sprint2-hu02a.spec.ts`, because a mock of the provider would
 * prove nothing about the integration.
 */
const DEMO: SocialEnv = {
  DEMO_MODE: 'true',
  OAUTH_DEMO_BASE_URL: 'http://127.0.0.1:8100',
  OAUTH_DEMO_GOOGLE_CLIENT_ID: 'demo-google-client',
  OAUTH_DEMO_GOOGLE_CLIENT_SECRET: 'demo-google-secret',
  OAUTH_DEMO_GITHUB_CLIENT_ID: 'demo-github-client',
  OAUTH_DEMO_GITHUB_CLIENT_SECRET: 'demo-github-secret',
};

const LIVE: SocialEnv = {
  GOOGLE_CLIENT_ID: 'real-google-client',
  GOOGLE_CLIENT_SECRET: 'real-google-secret',
  GITHUB_CLIENT_ID: 'real-github-client',
  GITHUB_CLIENT_SECRET: 'real-github-secret',
};

describe('social provider resolution', () => {
  it('CA-30: demo mode registers Google and GitHub through the simulated provider', () => {
    const setup = resolveSocialSetupFromEnv(DEMO);

    expect(setup.mode).toBe('demo');
    expect(setup.providers).toEqual(['google', 'github']);
    // The built-in providers must stay empty: registering `google` twice lets
    // the generic one shadow the native one, and the deployment then looks live
    // while behaving simulated.
    expect(setup.socialProviders).toEqual({});
    expect(setup.genericConfigs.map((config) => config.providerId)).toEqual(['google', 'github']);

    for (const config of setup.genericConfigs) {
      expect(config.authorizationUrl).toBe(
        `http://127.0.0.1:8100/oauth/${config.providerId}/authorize`,
      );
      expect(config.tokenUrl).toBe(`http://127.0.0.1:8100/oauth/${config.providerId}/token`);
      expect(config.userInfoUrl).toBe(`http://127.0.0.1:8100/oauth/${config.providerId}/userinfo`);
      // PKCE is asserted, not inherited: the simulated provider verifies the
      // challenge, so turning it off would make the demo pass while proving less
      // than a real provider requires.
      expect(config.pkce).toBe(true);
    }
  });

  it('CA-30: a new account from a provider gets its session without an extra round trip', () => {
    const setup = resolveSocialSetupFromEnv(DEMO);

    // ADR 0017 (literal reading): "crear una cuenta e iniciar sesión". Whether
    // the address starts verified is still decided by the provider's
    // `email_verified` claim, which is what keeps this from being "trust
    // anything".
    for (const config of setup.genericConfigs) {
      expect(config.requireEmailVerification).toBe(false);
    }
  });

  it('CA-31 / ADR 0016: linking to an existing account requires a verified provider claim and a verified local mailbox', () => {
    expect(ACCOUNT_LINKING_POLICY.enabled).toBe(true);
    expect(ACCOUNT_LINKING_POLICY.requireLocalEmailVerified).toBe(true);
    // No provider is trusted enough to skip the `email_verified` assertion.
    expect(ACCOUNT_LINKING_POLICY.trustedProviders).toEqual([]);
  });

  it('CA-30: real credentials use the native providers and no simulated config', () => {
    const setup = resolveSocialSetupFromEnv(LIVE);

    expect(setup.mode).toBe('live');
    expect(setup.providers).toEqual(['google', 'github']);
    expect(setup.socialProviders).toEqual({
      google: { clientId: 'real-google-client', clientSecret: 'real-google-secret' },
      github: { clientId: 'real-github-client', clientSecret: 'real-github-secret' },
    });
    expect(setup.genericConfigs).toEqual([]);
  });

  it('CA-30: the simulator wins over leftover real credentials instead of shadowing a provider', () => {
    const setup = resolveSocialSetupFromEnv({ ...LIVE, ...DEMO });

    expect(setup.mode).toBe('demo');
    expect(setup.socialProviders).toEqual({});
  });

  it('CA-30: DEMO_MODE alone does not arm the simulator', () => {
    const setup = resolveSocialSetupFromEnv({ ...LIVE, DEMO_MODE: 'true' });

    expect(setup.mode).toBe('live');
    expect(setup.genericConfigs).toEqual([]);
  });

  it('CA-30: an unconfigured deployment offers no social buttons', () => {
    const setup = resolveSocialSetupFromEnv({});

    expect(setup.mode).toBe('disabled');
    expect(setup.providers).toEqual([]);
    expect(setup.genericConfigs).toEqual([]);
  });

  it('CA-30: one provider configured offers only that provider', () => {
    const setup = resolveSocialSetupFromEnv({
      GOOGLE_CLIENT_ID: 'only-google',
      GOOGLE_CLIENT_SECRET: 'only-google-secret',
    });

    expect(setup.providers).toEqual(['google']);
  });

  it('CA-30: a partial simulator configuration refuses to build instead of dropping a provider', () => {
    expect(() =>
      resolveSocialSetupFromEnv({
        ...DEMO,
        OAUTH_DEMO_GITHUB_CLIENT_SECRET: undefined,
      }),
    ).toThrow(/OAUTH_DEMO_GITHUB_CLIENT_SECRET/);
  });

  it('CA-30: a trailing slash in the provider base URL does not produce a double slash', () => {
    const setup = resolveSocialSetupFromEnv({
      ...DEMO,
      OAUTH_DEMO_BASE_URL: 'http://127.0.0.1:8100/',
    });

    expect(setup.genericConfigs[0]?.authorizationUrl).toBe(
      'http://127.0.0.1:8100/oauth/google/authorize',
    );
  });
});

describe('OAuth callback messages', () => {
  it('CA-31: an unlinked existing account explains how to proceed instead of showing a dead end', () => {
    expect(socialErrorMessageKey('account_not_linked')).toBe('social.errors.accountNotLinked');
  });

  it('CA-31: an unverified provider claim is reported as such', () => {
    expect(socialErrorMessageKey('email_not_verified')).toBe('social.errors.emailNotVerified');
  });

  it('callback errors: no error in the URL renders no banner', () => {
    expect(socialErrorMessageKey(undefined)).toBeUndefined();
  });

  it('callback errors: an unrecognised code falls back to a generic message instead of echoing the query string', () => {
    expect(socialErrorMessageKey('<script>alert(1)</script>')).toBe('social.errors.generic');
  });
});
