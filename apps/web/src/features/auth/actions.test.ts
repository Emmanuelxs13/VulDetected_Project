import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbCalls, dbQueue, resetDbMock } from '@test/db-mock';

import { RateLimitError } from '@/lib/rate-limit';

import { registerAction } from './actions';

/**
 * CA-02: registering an address that already has an account is rejected with a
 * message that says so. These tests pin the rejection, the budget in front of it
 * and — importantly — that the old behaviour (attempting a sign-in with the
 * submitted password) is gone, because that branch was an unthrottled password
 * oracle.
 */

const signUpEmail = vi.fn<(input: unknown) => Promise<{ user?: { id: string } }>>(async () => ({
  user: { id: 'user-new' },
}));
const signInEmailSafe = vi.fn(async () => ({ ok: false }));
const audit = vi.fn(async () => undefined);
const consumeRateLimit = vi.fn<(config: unknown) => Promise<void>>(async () => undefined);

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

vi.mock('@/lib/auth', () => ({
  getAuth: () => ({ api: { signUpEmail: (input: unknown) => signUpEmail(input) } }),
}));

vi.mock('@/lib/audit', () => ({ audit: () => audit() }));

/**
 * `RateLimitError` is declared INSIDE the factory: `vi.mock` calls are hoisted
 * above the module body, so a class defined at module scope would still be in its
 * temporal dead zone when the factory runs.
 */
vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: (config: unknown) => consumeRateLimit(config),
  RateLimitError: class RateLimitError extends Error {},
}));

vi.mock('./request', () => ({
  requestIp: async () => '203.0.113.7',
  authHeaders: async () => new Headers(),
}));

vi.mock('./sign-in', () => ({
  signInEmailSafe: () => signInEmailSafe(),
  verifyAgainstDecoy: async () => undefined,
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    // Next's `redirect` signals control flow by throwing; mimic that so the
    // action's "audit before redirect" ordering is exercised for real.
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

function registrationForm(email: string, password = 'correct horse battery staple'): FormData {
  const form = new FormData();
  form.set('email', email);
  form.set('password', password);
  return form;
}

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
  signUpEmail.mockImplementation(async () => ({ user: { id: 'user-new' } }));
  signInEmailSafe.mockImplementation(async () => ({ ok: false }));
  consumeRateLimit.mockImplementation(async () => undefined);
});

describe('registerAction', () => {
  it('rejects an address that already has an account and names the reason', async () => {
    dbQueue.push([{ id: 'user-existing' }]);

    const result = await registerAction(null, registrationForm('taken@example.com'));

    expect(result).toEqual({ success: false, error: 'errors.emailInUse' });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('does not try the submitted password against the existing account', async () => {
    dbQueue.push([{ id: 'user-existing' }]);

    await registerAction(null, registrationForm('taken@example.com', 'attacker guess 1'));

    expect(signInEmailSafe).not.toHaveBeenCalled();
  });

  it('spends no email lookup or hash when the caller is over the budget', async () => {
    consumeRateLimit.mockImplementationOnce(async () => {
      throw new RateLimitError();
    });

    const result = await registerAction(null, registrationForm('new@example.com'));

    expect(result).toEqual({ success: false, error: 'errors.tooManyRequests' });
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(dbCalls).toHaveLength(0);
  });

  it('budgets five registrations per hour per caller address', async () => {
    dbQueue.push([]);

    await expect(registerAction(null, registrationForm('new@example.com'))).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    );

    expect(consumeRateLimit).toHaveBeenCalledWith({
      key: 'register:ip:203.0.113.7',
      limit: 5,
      windowSec: 3600,
    });
  });

  it('creates the account, audits it and sends the user to the login form', async () => {
    dbQueue.push([]);

    await expect(registerAction(null, registrationForm('new@example.com'))).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    );

    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('reports a genuine creation failure without claiming the address is taken', async () => {
    dbQueue.push([]);
    signUpEmail.mockResolvedValueOnce({} as never);

    const result = await registerAction(null, registrationForm('new@example.com'));

    expect(result).toEqual({ success: false, error: 'errors.createFailed' });
  });

  it('validates before spending a rate-limit token', async () => {
    const result = await registerAction(null, registrationForm('not-an-email', 'short'));

    expect(result).toMatchObject({ success: false, error: 'errors.checkFields' });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });
});
