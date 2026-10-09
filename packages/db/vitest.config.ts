import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the data layer.
 *
 * The schemas under test are pure Drizzle table definitions and enums; none of
 * them opens a connection, so the default `node` environment is all that is
 * needed. Tests that would require a live Postgres (migration application) belong
 * to the E2E layer, not here.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
