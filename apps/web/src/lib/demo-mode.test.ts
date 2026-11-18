import { afterEach, describe, expect, it, vi } from 'vitest';

import { demoAllowsPrivateTargets, demoModeEnabled, scanRequiresVerifiedDomain } from './demo-mode';

/**
 * The demo switches are the difference between "this feature is off" and "this
 * feature is off in production, always". The production half is the part that
 * matters, so it is the part these tests pin.
 */
describe('demoModeEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false by default', () => {
    expect(demoModeEnabled()).toBe(false);
  });

  it('is true only when DEMO_MODE is the string "true"', () => {
    vi.stubEnv('DEMO_MODE', 'true');
    expect(demoModeEnabled()).toBe(true);

    vi.stubEnv('DEMO_MODE', 'false');
    expect(demoModeEnabled()).toBe(false);

    // `1` is not a synonym. Accepting several spellings is how a flag gets
    // enabled by accident.
    vi.stubEnv('DEMO_MODE', '1');
    expect(demoModeEnabled()).toBe(false);
  });

  it('is false in production even when DEMO_MODE is true', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_MODE', 'true');
    expect(demoModeEnabled()).toBe(false);
  });
});

describe('demoAllowsPrivateTargets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false by default', () => {
    expect(demoAllowsPrivateTargets()).toBe(false);
  });

  it('is false in production even when enabled', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_ALLOW_PRIVATE_TARGETS', 'true');
    expect(demoAllowsPrivateTargets()).toBe(false);
  });
});

describe('scanRequiresVerifiedDomain', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to requiring proof', () => {
    expect(scanRequiresVerifiedDomain()).toBe(true);
  });

  it('can be disabled outside production', () => {
    vi.stubEnv('SCAN_REQUIRE_VERIFIED_DOMAIN', 'false');
    expect(scanRequiresVerifiedDomain()).toBe(false);
  });
});
