import 'server-only';

import { getEnv } from '../env';
import { resolveSocialSetupFromEnv, type SocialSetup } from './social';

/**
 * The social providers this deployment offers, resolved from the environment.
 *
 * Server-only by construction: `social.ts` is pure and importable anywhere, but
 * only a server component or the auth instance may read the environment. The
 * login and registration pages call this and pass the provider ids down to the
 * buttons, which is what keeps a rendered button and a registered provider from
 * ever disagreeing.
 */
export function getSocialSetup(): SocialSetup {
  return resolveSocialSetupFromEnv(getEnv());
}
