import { describe, expect, it } from 'vitest';

import { LOGIN_FAILURE_REASONS, loginFailureReason } from './login-failure';

/**
 * The reason list is the contract between two separately deployed services, so
 * what matters is that an unknown value never reaches the page as a raw code.
 */
describe('loginFailureReason', () => {
  it('extracts every reason the worker can write', () => {
    for (const reason of LOGIN_FAILURE_REASONS) {
      expect(loginFailureReason(`login_failed: ${reason}`)).toBe(reason);
    }
  });

  it('ignores errors that are not login failures', () => {
    expect(loginFailureReason(null)).toBeNull();
    expect(loginFailureReason('')).toBeNull();
    expect(loginFailureReason('cancelled_by_user')).toBeNull();
    expect(loginFailureReason('scan_budget_exceeded: 120s')).toBeNull();
  });

  it('does not leak an unknown reason', () => {
    expect(loginFailureReason('login_failed: something_new')).toBeNull();
    expect(loginFailureReason('login_failed:')).toBeNull();
  });
});
