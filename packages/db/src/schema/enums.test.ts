import { describe, expect, it } from 'vitest';

import { accountStatusEnum, scanStatusEnum, severityEnum, tokenPurposeEnum } from './enums';

/**
 * Runner smoke test for the data layer.
 *
 * It pins two Sprint 1 enum contracts that Sprint 2 builds on directly: the
 * account lifecycle states the scan-ownership guard must respect, and the
 * `domain_ownership` token purpose reserved for the Sprint 2 challenge flow.
 * A green run proves Vitest is wired for `packages/db`; the enum assertions keep
 * the pre-existing contract from drifting silently.
 */
describe('schema enums', () => {
  it('account_status carries every lifecycle state', () => {
    expect(accountStatusEnum.enumValues).toEqual(['pending', 'active', 'suspended', 'deleted']);
  });

  it('token_purpose reserves domain_ownership for the Sprint 2 challenge flow', () => {
    expect(tokenPurposeEnum.enumValues).toContain('domain_ownership');
  });

  it('scan_status fixes the Sprint 2 scan lifecycle vocabulary', () => {
    expect(scanStatusEnum.enumValues).toEqual([
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled',
    ]);
  });

  it('severity leads with unclassified — the only value Sprint 2 writes (DM-3)', () => {
    expect(severityEnum.enumValues).toEqual([
      'unclassified',
      'info',
      'low',
      'medium',
      'high',
      'critical',
    ]);
    expect(severityEnum.enumValues[0]).toBe('unclassified');
  });
});
