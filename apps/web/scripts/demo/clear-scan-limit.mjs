#!/usr/bin/env node
/**
 * Clears the per-user scan budget so a verification run starts from zero.
 *
 * ## Why this exists
 *
 * `submitScan` limits each user to five scans per hour
 * (`consumeRateLimit({ key: 'user:<id>:scan', limit: 5, windowSec: 3600 })`).
 * That is a real product limit and it stays: the suite below does not raise it,
 * bypass it, or assert against a mocked one.
 *
 * What it does is restore the precondition each spec assumes. The Sprint 2
 * browser suite signs in as the same demo account in every file and submits
 * seven scans across the run, so the seventh is refused with
 * "Alcanzaste el límite de escaneos por hora" — a correct answer from the
 * product to a situation no single user would create in ten minutes. Run file
 * by file the budget never fills; run the whole suite and it does.
 *
 * Clearing a counter does not weaken the limit: the next request recreates the
 * window, and `lib/rate-limit.test.ts` still proves the limit holds. The
 * distinction that matters is that this script is a *test precondition*, while
 * `lib/rate-limit.ts` is the *control*. Only the control belongs to the product.
 *
 * ## Why only `rl:user:*:scan:*`
 *
 * The authentication limiter is a different key and is left armed on purpose:
 * HU-02a has to observe it working. Deleting every `rl:*` key here would make a
 * future test of the login limiter silently pass.
 *
 * `pnpm demo:reset` still clears all of `rl:*`, because a full reset is a
 * different promise: a clean demo, not a clean test file.
 */
import { createClient } from 'redis';

import { closeRedis, requireDemoMode } from './_shared.mjs';

const SCRIPT = 'demo:clear-scan-limit';

// Also loads `.env.local`, and refuses to touch a Redis that a production
// deployment could be using.
requireDemoMode(SCRIPT);

const url = process.env.REDIS_URL ?? 'redis://localhost:6379/0';

const client = createClient({
  url,
  socket: { connectTimeout: 3_000, reconnectStrategy: () => new Error('Redis is unreachable') },
});
client.on('error', (error) => console.error(`[${SCRIPT}] redis: ${error.message}`));

try {
  await client.connect();

  let cursor = '0';
  let removed = 0;

  do {
    const page = await client.scan(cursor, { MATCH: 'rl:user:*:scan:*', COUNT: 500 });
    cursor = page.cursor;
    if (page.keys.length > 0) {
      await client.del(page.keys);
      removed += page.keys.length;
    }
  } while (cursor !== '0');

  console.log(`[${SCRIPT}] ${removed} scan budget counter(s) cleared`);
} catch (error) {
  // Failing loudly is right here. A silent skip would leave the suite to fail
  // later with "Alcanzaste el límite de escaneos", which sends the reader
  // looking for a product bug that is not there.
  console.error(`[${SCRIPT}] could not reach Redis at ${url}: ${error.message}`);
  await closeRedis(client);
  process.exit(1);
}

await closeRedis(client);
