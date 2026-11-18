import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getEnv, resetEnvForTesting } from './env';

/**
 * `lib/env.ts` is the only module allowed to read `process.env`, which makes it
 * the only place where a dangerous flag can be refused once instead of guarded
 * at every call site.
 *
 * These tests pin the refusals, not the happy path: a schema that accepts a
 * valid environment is table stakes, a schema that refuses to boot production
 * with a demo accelerator armed is the contract.
 */
const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/vuldetected',
  AUTH_SECRET: 'a'.repeat(40),
  AUTH_URL: 'http://localhost:3000',
};

function stubBase(overrides: Record<string, string> = {}): void {
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

describe('getEnv — production refusals', () => {
  beforeEach(() => {
    resetEnvForTesting();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTesting();
  });

  it('refuses to boot production with DEMO_MODE enabled', () => {
    stubBase({
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.com',
      EMAIL_FROM: 'no-reply@example.com',
      CREDENTIALS_ENCRYPTION_KEY: 'k'.repeat(44),
      DEMO_MODE: 'true',
    });

    expect(() => getEnv()).toThrow(/DEMO_MODE/);
  });

  it('refuses to boot production with DEMO_ALLOW_PRIVATE_TARGETS enabled', () => {
    stubBase({
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.com',
      EMAIL_FROM: 'no-reply@example.com',
      CREDENTIALS_ENCRYPTION_KEY: 'k'.repeat(44),
      DEMO_ALLOW_PRIVATE_TARGETS: 'true',
    });

    expect(() => getEnv()).toThrow(/DEMO_ALLOW_PRIVATE_TARGETS/);
  });

  it('refuses to boot production with ownership verification disabled', () => {
    stubBase({
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.com',
      EMAIL_FROM: 'no-reply@example.com',
      CREDENTIALS_ENCRYPTION_KEY: 'k'.repeat(44),
      SCAN_REQUIRE_VERIFIED_DOMAIN: 'false',
    });

    expect(() => getEnv()).toThrow(/SCAN_REQUIRE_VERIFIED_DOMAIN/);
  });

  it('accepts DEMO_MODE outside production', () => {
    stubBase({ DEMO_MODE: 'true' });

    expect(getEnv().DEMO_MODE).toBe('true');
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    stubBase({ DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/db' });

    expect(() => getEnv()).toThrow(/postgres/);
  });
});
