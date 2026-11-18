import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { domains, eq, scanSchedules, scans } from '@vuldetected/db';
import { createPgliteTestDb, type PgliteTestDb } from '@vuldetected/db/testing/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CA-23 regression: a due schedule must be claimed even when its `next_run_at`
 * was written by SQL.
 *
 * ## The defect this pins down
 *
 * `scan_schedules.next_run_at` is a `timestamptz`, which stores microseconds.
 * The driver hands it back as a JavaScript `Date`, which only holds
 * milliseconds. The claim used to be a plain equality on that value, so it never
 * matched a timestamp written by `now()` (the column default, the demo
 * accelerator, any SQL insert). The runner then reported the row as skipped on
 * every single tick, forever, and no scheduled scan was ever created.
 *
 * A mocked `db` cannot catch this: the failure lives in the interaction between
 * Postgres's precision and the driver's `Date`. So this suite runs the REAL
 * migrations against an in-process PGlite instance and writes `next_run_at` with
 * `now()`, exactly like the production paths that exposed the bug.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Every migration the scan and schedule tables depend on, in journal order. */
const MIGRATION_FILES = [
  '0003_scan_domain.sql',
  '0004_warm_pretty_boy.sql',
  '0005_third_goblin_queen.sql',
  '0006_grey_sleeper.sql',
  '0007_real_tombstone.sql',
  '0008_amazing_wonder_man.sql',
  '0009_foamy_mathemanic.sql',
  '0010_absurd_frank_castle.sql',
  '0011_perfect_the_liberteens.sql',
  '0012_clammy_songbird.sql',
  '0013_aromatic_dreaming_celestial.sql',
].map((file) => path.resolve(dirname, '../../../packages/db/drizzle', file));

const USER_ID = '33333333-3333-4333-8333-333333333333';

type HarnessDb = PgliteTestDb['db'];

const harness = vi.hoisted(() => ({
  db: undefined as unknown as HarnessDb,
  published: [] as unknown[],
}));

vi.mock('@/lib/db', () => ({ db: () => harness.db }));

vi.mock('@/lib/celery', () => ({
  enqueueScanJob: vi.fn(async (payload: unknown) => {
    harness.published.push(payload);
  }),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));

vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    AUTH_URL: 'http://localhost:3000',
  }),
}));

vi.mock('@/lib/plan-limits', () => ({
  checkScanAllowance: vi.fn(async () => null),
}));

vi.mock('@/lib/credentials/store', () => {
  class CredentialUnavailableError extends Error {
    constructor(
      message: string,
      readonly reason: string,
    ) {
      super(message);
      this.name = 'CredentialUnavailableError';
    }
  }

  return {
    CredentialUnavailableError,
    activeCredentialForScan: vi.fn(async () => null),
    markCredentialUsed: vi.fn(async () => undefined),
  };
});

import { runDueSchedules } from '@/lib/scheduled-scans';

let database: PgliteTestDb;
let domainId: string;

beforeAll(async () => {
  database = createPgliteTestDb();

  // The migration's FK only needs the referenced key; the full Sprint 1 auth
  // schema (and `citext`) is irrelevant to the scheduler.
  await database.exec('CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());');

  const migration = MIGRATION_FILES.map((file) => readFileSync(file, 'utf8')).join(
    '--> statement-breakpoint',
  );
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim().length > 0) {
      await database.exec(statement);
    }
  }

  harness.db = database.db;
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  harness.published.length = 0;

  await database.exec(
    'TRUNCATE TABLE findings, scan_events, scans, scan_schedules, domains RESTART IDENTITY CASCADE',
  );
  await database.client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING', [
    USER_ID,
  ]);

  const [domain] = await harness.db
    .insert(domains)
    .values({
      userId: USER_ID,
      hostname: 'example.com',
      normalizedHostname: 'example.com',
      verified: true,
      verificationMethod: 'dns_txt',
      verificationRecord: 'published-proof',
      verifiedAt: new Date(),
    })
    .returning({ id: domains.id });

  domainId = domain!.id;
});

describe('CA-23 scheduled scan claim', () => {
  it('claims a schedule whose next_run_at was written by SQL with microseconds', async () => {
    // `now()` is the exact shape that broke the plain-equality claim: it carries
    // microsecond digits a JS Date cannot represent.
    const inserted = await database.client.query<{ id: string; next_run_at: string }>(
      `INSERT INTO scan_schedules (domain_id, user_id, interval, enabled, next_run_at)
       VALUES ($1, $2, 'daily', true, now() - interval '5 minutes')
       RETURNING id, next_run_at::text AS next_run_at`,
      [domainId, USER_ID],
    );

    const scheduleId = inserted.rows[0]!.id;

    const result = await runDueSchedules(new Date());

    expect(result).toEqual({ due: 1, enqueued: 1, failed: 0, skipped: 0 });

    const [schedule] = await harness.db
      .select({
        lastRunAt: scanSchedules.lastRunAt,
        nextRunAt: scanSchedules.nextRunAt,
      })
      .from(scanSchedules)
      .where(eq(scanSchedules.id, scheduleId));

    expect(schedule?.lastRunAt).not.toBeNull();
    expect(schedule?.nextRunAt?.getTime() ?? 0).toBeGreaterThan(Date.now());

    const created = await harness.db
      .select({ id: scans.id, status: scans.status, source: scans.source })
      .from(scans)
      .where(eq(scans.domainId, domainId));

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: 'queued', source: 'schedule' });
    expect(harness.published).toHaveLength(1);
  });

  it('does not fire the same schedule twice on the same tick', async () => {
    await database.client.query(
      `INSERT INTO scan_schedules (domain_id, user_id, interval, enabled, next_run_at)
       VALUES ($1, $2, 'daily', true, now() - interval '5 minutes')`,
      [domainId, USER_ID],
    );

    const now = new Date();
    const first = await runDueSchedules(now);
    const second = await runDueSchedules(now);

    expect(first.enqueued).toBe(1);
    expect(second).toEqual({ due: 0, enqueued: 0, failed: 0, skipped: 0 });
  });

  it('skips a window while a scan for the same domain is still queued', async () => {
    await database.client.query(
      `INSERT INTO scan_schedules (domain_id, user_id, interval, enabled, next_run_at)
       VALUES ($1, $2, 'daily', true, now() - interval '5 minutes')`,
      [domainId, USER_ID],
    );
    await harness.db.insert(scans).values({
      domainId,
      targetUrl: 'https://example.com',
      status: 'queued',
      source: 'manual',
    });

    const result = await runDueSchedules(new Date());

    expect(result).toEqual({ due: 1, enqueued: 0, failed: 0, skipped: 1 });
  });
});
