import { describe, expect, it } from 'vitest';

import { MIN_PASSWORD_LENGTH, registerSchema } from './schema';

/**
 * Runner smoke test for the web workspace.
 *
 * It asserts a real Sprint 1 contract (password length and email normalisation)
 * rather than a synthetic `1 + 1`, so a green run proves both that Vitest is
 * wired correctly and that the validation boundary the auth actions depend on is
 * still intact after the Sprint 2 test tooling landed.
 */
describe('registerSchema', () => {
  it('rejects a password shorter than the minimum length', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
    });

    expect(result.success).toBe(false);
  });

  it('trims and lowercases the email for the citext lookup', () => {
    const result = registerSchema.safeParse({
      email: '  User@Example.com  ',
      password: 'a'.repeat(MIN_PASSWORD_LENGTH),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
      // `name` is optional: email-only signup must not demand one.
      expect(result.data.name).toBeUndefined();
    }
  });
});
