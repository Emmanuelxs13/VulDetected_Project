import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth';

/**
 * Which social providers this deployment offers, and how they are reached.
 *
 * ## Why this is a separate, pure module
 *
 * The decision "is Google configured, and against which endpoints" used to be
 * three `if` statements inside `buildAuth()`. That made it untestable and made
 * the login screen depend on two `NEXT_PUBLIC_*` variables that could disagree
 * with the server — a screen offering a button whose provider is not registered
 * fails *after* the user clicks it, which is the worst moment to find out.
 *
 * Here the answer is a value. The auth instance consumes it, and the pages
 * consume it, so the button and the provider can never disagree.
 *
 * ## The two modes
 *
 * - `live`: real OAuth credentials are present. Better Auth's native providers
 *   are used, because they already encode each provider's quirks (GitHub's
 *   separate `/user/emails` call, Google's OIDC discovery).
 * - `demo`: no real credentials exist, so a local provider that implements the
 *   same OAuth 2.0 authorization-code + PKCE contract is used instead. It is a
 *   demo component and it announces itself as one on every screen.
 *
 * The demo is not a stub of the *decision*: whether a session is issued, whether
 * an existing account may be linked, and whether a verification email goes out
 * are all decided by the same application code in both modes.
 */
export type SocialProviderId = 'google' | 'github';

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface DemoProviderSettings {
  /** Base URL of the simulated provider, e.g. `http://127.0.0.1:8100`. */
  baseUrl: string;
  google: ProviderCredentials;
  github: ProviderCredentials;
}

export interface SocialSetupInput {
  demo: DemoProviderSettings | null;
  google: ProviderCredentials | null;
  github: ProviderCredentials | null;
}

export interface SocialSetup {
  mode: 'demo' | 'live' | 'disabled';
  /** The providers the UI may offer, in the order the buttons are rendered. */
  providers: SocialProviderId[];
  /** Passed straight to `betterAuth({ socialProviders })`. Live mode only. */
  socialProviders: Record<string, ProviderCredentials>;
  /** Passed to the `genericOAuth` plugin. Demo mode only. */
  genericConfigs: GenericOAuthConfig[];
}

const PROVIDER_ORDER: readonly SocialProviderId[] = ['google', 'github'];

/**
 * The account-linking policy, kept as a value so it can be asserted by a test.
 *
 * ## ADR 0016 in one object
 *
 * The library's defaults already implement the rule — an implicit link requires
 * the provider to assert `emailVerified` AND the local account to have verified
 * its own mailbox (`dist/oauth2/link-account.mjs:169-171`). These three fields
 * restate it at the one place a future edit would touch.
 *
 * The failure mode this guards against is not a bug, it is convenience:
 * `requireLocalEmailVerified: false` makes "sign in with Google" work for
 * everyone in a demo and silently removes the protection against attaching a
 * provider to an account that never proved control of the address. A test that
 * asserts these three values is what turns that edit into a red build.
 */
export const ACCOUNT_LINKING_POLICY: {
  enabled: boolean;
  requireLocalEmailVerified: boolean;
  /** No provider is exempt from the `emailVerified` assertion. */
  trustedProviders: string[];
} = {
  enabled: true,
  requireLocalEmailVerified: true,
  trustedProviders: [],
};

/**
 * The subset of the environment this module needs.
 *
 * Declared structurally rather than importing `Env` so that this module stays
 * pure and testable: a test passes an object literal, not a parsed environment.
 */
export interface SocialEnv {
  DEMO_MODE?: string;
  OAUTH_DEMO_BASE_URL?: string;
  OAUTH_DEMO_GOOGLE_CLIENT_ID?: string;
  OAUTH_DEMO_GOOGLE_CLIENT_SECRET?: string;
  OAUTH_DEMO_GITHUB_CLIENT_ID?: string;
  OAUTH_DEMO_GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

/** Names of the four demo variables, so a partial configuration names what is missing. */
const DEMO_VARIABLES = [
  'OAUTH_DEMO_GOOGLE_CLIENT_ID',
  'OAUTH_DEMO_GOOGLE_CLIENT_SECRET',
  'OAUTH_DEMO_GITHUB_CLIENT_ID',
  'OAUTH_DEMO_GITHUB_CLIENT_SECRET',
] as const;

/**
 * Reads one of the four variables after the batch check above has already
 * refused a partial configuration. The second check exists so the return type is
 * `string` without a cast: a cast here would keep compiling if the batch check
 * were ever removed, and this is a credential.
 */
function requiredDemoValue(
  env: SocialEnv,
  name: (typeof DEMO_VARIABLES)[number],
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required when OAUTH_DEMO_BASE_URL is set.`);
  }
  return value;
}

/**
 * Reads the setup out of the environment.
 *
 * ## Why a partially configured demo THROWS
 *
 * `DEMO_MODE=true` plus a provider base URL is a deliberate statement: "this run
 * signs in through the simulated provider". If two of the four credentials are
 * missing, the honest outcomes are "refuse to start" or "silently no social
 * login". The second one fails during the demo, in front of the audience, on a
 * button that renders and then errors. A boot-time error naming the variables is
 * the only version of this that gets fixed before the presentation.
 *
 * The base URL alone is NOT enough to arm demo mode, though: a developer running
 * `DEMO_MODE=true` for the scan accelerators and real Google credentials should
 * get the real providers. Demo mode needs both the switch and the base URL.
 */
export function resolveSocialSetupFromEnv(env: SocialEnv): SocialSetup {
  const demoBaseUrl = env.DEMO_MODE === 'true' ? env.OAUTH_DEMO_BASE_URL : undefined;

  if (demoBaseUrl) {
    const missing = DEMO_VARIABLES.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(
        `OAUTH_DEMO_BASE_URL is set, so the simulated OAuth provider is armed, but these ` +
          `variables are missing: ${missing.join(', ')}. Set all four (they are demo-only ` +
          'values; see .env.example) or unset OAUTH_DEMO_BASE_URL to use the real providers.',
      );
    }

    return resolveSocialSetup({
      demo: {
        baseUrl: demoBaseUrl,
        google: {
          clientId: requiredDemoValue(env, 'OAUTH_DEMO_GOOGLE_CLIENT_ID'),
          clientSecret: requiredDemoValue(env, 'OAUTH_DEMO_GOOGLE_CLIENT_SECRET'),
        },
        github: {
          clientId: requiredDemoValue(env, 'OAUTH_DEMO_GITHUB_CLIENT_ID'),
          clientSecret: requiredDemoValue(env, 'OAUTH_DEMO_GITHUB_CLIENT_SECRET'),
        },
      },
      google: null,
      github: null,
    });
  }

  return resolveSocialSetup({
    demo: null,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : null,
    github:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
        : null,
  });
}

/**
 * Builds the provider configuration.
 *
 * Demo mode wins when both are present. That is deliberate and not an oversight:
 * a machine with leftover real credentials plus the demo provider would
 * otherwise register `google` twice, and Better Auth resolves that by silently
 * shadowing the built-in provider with the generic one — a configuration that
 * looks live and behaves simulated.
 */
export function resolveSocialSetup(input: SocialSetupInput): SocialSetup {
  if (input.demo) {
    const { baseUrl } = input.demo;

    const genericConfigs: GenericOAuthConfig[] = [
      demoProvider('google', baseUrl, input.demo.google),
      demoProvider('github', baseUrl, input.demo.github),
    ];

    return {
      mode: 'demo',
      providers: [...PROVIDER_ORDER],
      socialProviders: {},
      genericConfigs,
    };
  }

  const socialProviders: Record<string, ProviderCredentials> = {};
  if (input.google) socialProviders.google = input.google;
  if (input.github) socialProviders.github = input.github;

  const providers = PROVIDER_ORDER.filter((id) => socialProviders[id] !== undefined);

  return {
    mode: providers.length > 0 ? 'live' : 'disabled',
    providers,
    socialProviders,
    genericConfigs: [],
  };
}

function demoProvider(
  providerId: SocialProviderId,
  baseUrl: string,
  credentials: ProviderCredentials,
): GenericOAuthConfig {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    providerId,
    // The name is rendered nowhere the user sees in the demo flow, but if it
    // ever is, it must not claim to be the real thing.
    name: providerId === 'google' ? 'Google (simulado)' : 'GitHub (simulado)',
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    authorizationUrl: `${root}/oauth/${providerId}/authorize`,
    tokenUrl: `${root}/oauth/${providerId}/token`,
    userInfoUrl: `${root}/oauth/${providerId}/userinfo`,
    scopes: ['openid', 'email', 'profile'],

    /**
     * PKCE on, which is the plugin's default and is asserted here because the
     * demo provider verifies the challenge. Turning it off would make the demo
     * pass while proving less than a real provider requires.
     */
    pkce: true,

    /**
     * ADR 0017, literal reading of CA-30: a new account gets its session in the
     * same step. The provider's verification claim still decides whether the
     * local account starts verified and whether a confirmation email is sent,
     * so this is not "trust anything" — it is "do not require a round trip the
     * criterion does not ask for".
     */
    requireEmailVerification: false,
  };
}
