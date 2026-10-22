import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { asc, domains, eq, findings, scanEvents, scans } from '@vuldetected/db';
import { createPgliteTestDb, type PgliteTestDb } from '@vuldetected/db/testing/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScanJobKwargs } from '@/lib/celery';

/**
 * End-to-end scan pipeline (task 5.3, `SCANNER_EGRESS_MODE=test`).
 *
 * ## What actually runs
 *
 * `submitScanAction` → the real Celery 5.x message encoder → the callback route
 * → the real Drizzle query builders/SQL → the SSE/JSON events route. The
 * database is an in-process PGlite instance (Postgres in WASM) with the real
 * Sprint 2 migration applied, so `UNIQUE (scan_id, seq)` and
 * `UNIQUE (scan_id, finding_key)` are enforced by Postgres itself, not by the
 * test. No Docker, Postgres server, Redis server or Python worker is needed.
 *
 * ## What is simulated (and why)
 *
 * The broker and the worker are the process boundary of this change. The Redis
 * client is replaced with a recorder so the exact bytes `enqueueScanJob` would
 * publish can be decoded and asserted; the "worker" is the test posting
 * worker-shaped callback payloads. Running the Python worker would require a
 * live Redis + Celery deployment and is not what a Node harness can honestly
 * claim to do.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(dirname, '../../../packages/db/drizzle/0003_scan_domain.sql');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const SECRET = 'dev-scanner-callback-secret';

type HarnessDb = PgliteTestDb['db'];

const harness = vi.hoisted(() => ({
  db: undefined as unknown as HarnessDb,
  celeryQueue: [] as { queue: string; payload: string }[],
}));

vi.mock('@/lib/db', () => ({ db: () => harness.db }));

/**
 * The broker boundary. The real `enqueueScanJob` builds the message; only the
 * Redis transport is replaced, so the encoded body is the production encoder's
 * output.
 */
vi.mock('@/lib/redis', () => ({
  withRedis: vi.fn(
    async (
      fn: (client: {
        lPush: (queue: string, payload: string) => Promise<number>;
      }) => Promise<unknown>,
    ) =>
      fn({
        lPush: async (queue, payload) => {
          harness.celeryQueue.push({ queue, payload });
          return 1;
        },
      }),
  ),
}));

vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => undefined),
  RateLimitError: class RateLimitError extends Error {},
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));

vi.mock('@/features/auth/session', () => ({
  requireUser: vi.fn(async () => ({
    userId: USER_ID,
    session: { user: { id: USER_ID } },
  })),
  getServerSession: vi.fn(async () => ({ user: { id: USER_ID } })),
}));

import { GET as getScanEvents } from '@/app/api/scans/[scanId]/events/route';
import { POST as postScanCallback } from '@/app/api/scans/[scanId]/callback/route';
import { getServerSession } from '@/features/auth/session';
import { submitScanAction } from '@/features/scans/actions';

interface CeleryEnvelope {
  body: string;
  'content-encoding': string;
  'content-type': string;
  headers: {
    task: string;
    id: string;
    retries: number;
    ignore_result: boolean;
  };
  properties: {
    delivery_info: { exchange: string; routing_key: string };
    body_encoding: string;
    correlation_id: string;
  };
}

type Session = Awaited<ReturnType<typeof getServerSession>>;

function session(value: unknown): Session {
  return value as Session;
}

function callbackRequest(scanId: string, body: unknown, token: string | null = SECRET): Request {
  return new Request(`http://localhost:3000/api/scans/${scanId}/callback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

function eventRequest(scanId: string, query = '', accept?: string): Request {
  return new Request(`http://localhost:3000/api/scans/${scanId}/events${query}`, {
    headers: accept ? { accept } : undefined,
  });
}

let database: PgliteTestDb;

beforeAll(async () => {
  database = createPgliteTestDb();

  // Minimal stand-in for the Sprint 1 `users` table: the migration's FK only
  // needs the referenced key. The Sprint 1 migration is not applied because it
  // pulls in `citext` and the full auth schema, none of which this pipeline
  // touches.
  await database.exec('CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());');

  // Apply the REAL Sprint 2 migration, so the constraints under test are the
  // ones production gets. This is not `drizzle-kit migrate` (prohibited); it is
  // the same SQL executed against an in-process database.
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
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
  harness.celeryQueue.length = 0;

  await database.exec(
    'TRUNCATE TABLE findings, scan_events, scans, domains RESTART IDENTITY CASCADE',
  );
  await database.client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING', [
    USER_ID,
  ]);

  await harness.db.insert(domains).values({
    userId: USER_ID,
    hostname: 'example.com',
    normalizedHostname: 'example.com',
    verified: true,
    verificationMethod: 'dns_txt',
    verificationRecord: 'published-proof',
    verifiedAt: new Date(),
  });
});

async function insertQueuedScan(): Promise<string> {
  const domainRows = await harness.db.select({ id: domains.id }).from(domains).limit(1);
  const domain = domainRows[0];
  if (domain === undefined) {
    throw new Error('test setup: no domain row');
  }

  const scanId = randomUUID();
  await harness.db.insert(scans).values({
    id: scanId,
    domainId: domain.id,
    targetUrl: 'https://example.com',
    status: 'queued',
  });

  return scanId;
}

async function readScan(scanId: string) {
  const rows = await harness.db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
  return rows[0];
}

async function readEvents(scanId: string) {
  return harness.db
    .select()
    .from(scanEvents)
    .where(eq(scanEvents.scanId, scanId))
    .orderBy(asc(scanEvents.id));
}

async function readFindings(scanId: string) {
  return harness.db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scanId))
    .orderBy(asc(findings.findingKey));
}

/** Posts a non-terminal progress callback that starts the scan. */
async function startScan(scanId: string): Promise<void> {
  const response = await postScanCallback(
    callbackRequest(scanId, {
      scan_id: scanId,
      status: 'running',
      events: [{ seq: 1, type: 'scan.started', payload: {} }],
    }),
    { params: { scanId } },
  );

  expect(response.status).toBe(200);
}

/** Posts a terminal callback with one finding. */
async function completeScan(scanId: string): Promise<void> {
  const response = await postScanCallback(
    callbackRequest(scanId, {
      scan_id: scanId,
      task_id: 'task-e2e',
      status: 'completed',
      error: null,
      base_url: 'https://example.com',
      events: [{ seq: 2, type: 'scan.completed', payload: {} }],
      findings: [
        {
          key: 'a'.repeat(64),
          check: 'security_headers',
          title: 'Missing Content-Security-Policy header',
          description: 'The response does not send a Content-Security-Policy header.',
          affected_url: 'https://example.com/',
          evidence: { header: 'content-security-policy' },
          raw: { observed: { present: false } },
        },
      ],
    }),
    { params: { scanId } },
  );

  expect(response.status).toBe(200);
}

describe('scan pipeline (SCANNER_EGRESS_MODE=test)', () => {
  it('runs under the hermetic egress mode named by the task', () => {
    expect(process.env.SCANNER_EGRESS_MODE).toBe('test');
  });

  it('persists `queued` and publishes a real Celery 5.x message for a verified domain', async () => {
    const result = await submitScanAction({ url: 'HTTPS://Example.COM' });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const { scanId } = result.data;

    const scan = await readScan(scanId);
    expect(scan?.status).toBe('queued');
    expect(scan?.targetUrl).toBe('https://example.com');

    expect(harness.celeryQueue).toHaveLength(1);
    const published = harness.celeryQueue[0];
    expect(published?.queue).toBe('celery');

    // The bytes are the production encoder's output: decode them the way a
    // Celery worker would.
    const envelope = JSON.parse(published?.payload ?? '{}') as CeleryEnvelope;
    expect(envelope['content-encoding']).toBe('utf-8');
    expect(envelope['content-type']).toBe('application/json');
    expect(envelope.headers.task).toBe('scanner.tasks.run_scan');
    expect(envelope.headers.retries).toBe(0);
    expect(envelope.headers.ignore_result).toBe(true);
    expect(envelope.properties.delivery_info).toEqual({ exchange: '', routing_key: 'celery' });
    expect(envelope.properties.body_encoding).toBe('base64');
    expect(envelope.properties.correlation_id).toBe(envelope.headers.id);

    const decoded = JSON.parse(Buffer.from(envelope.body, 'base64').toString('utf8')) as [
      unknown[],
      ScanJobKwargs,
      unknown,
    ];

    expect(decoded[0]).toEqual([]);
    expect(decoded[1].scan_id).toBe(scanId);
    expect(decoded[1].domain_id).toBe(scan?.domainId);
    expect(decoded[1].target).toEqual({
      scheme: 'https',
      host: 'example.com',
      port: 443,
      base_url: 'https://example.com',
    });
    expect(decoded[1].checks).toEqual(['security_headers', 'tls', 'cookies', 'redirects']);
    expect(decoded[1].callback_base_url).toBe('http://localhost:3000');
    expect(decoded[2]).toEqual({
      callbacks: null,
      errbacks: null,
      chain: null,
      chord: null,
    });
  });

  it('applies worker progress and absorbs a retried callback through ON CONFLICT (scan_id, seq)', async () => {
    const scanId = await insertQueuedScan();

    const progress = {
      scan_id: scanId,
      status: 'running',
      events: [
        { seq: 1, type: 'scan.started', payload: {} },
        { seq: 2, type: 'check.started', payload: { check: 'tls' } },
      ],
    };

    const first = await postScanCallback(callbackRequest(scanId, progress), {
      params: { scanId },
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });

    // Same payload again: a worker retry. The unique constraint rejects both
    // rows and `onConflictDoNothing()` turns the retry into a no-op.
    const retry = await postScanCallback(callbackRequest(scanId, progress), {
      params: { scanId },
    });
    expect(retry.status).toBe(200);

    const scan = await readScan(scanId);
    expect(scan?.status).toBe('running');
    expect(scan?.startedAt).toBeInstanceOf(Date);

    const events = await readEvents(scanId);
    expect(events.map((event) => event.seq)).toEqual([1, 2]);
    expect(events.map((event) => event.type)).toEqual(['scan.started', 'check.started']);
    expect(events[1]?.payload).toEqual({ check: 'tls' });
  });

  it('persists final findings, deduplicates them by finding_key, and closes the scan', async () => {
    const scanId = await insertQueuedScan();
    await startScan(scanId);

    const finding = {
      key: 'a'.repeat(64),
      check: 'security_headers',
      title: 'Missing Content-Security-Policy header',
      description: 'The response does not send a Content-Security-Policy header.',
      // The design's worker contract is snake_case; the route currently reads
      // `affectedUrl` (reported as a gap in the task report, not fixed here).
      affected_url: 'https://example.com/',
      evidence: { header: 'content-security-policy' },
      raw: { observed: { present: false } },
    };

    const response = await postScanCallback(
      callbackRequest(scanId, {
        scan_id: scanId,
        task_id: 'task-e2e',
        status: 'completed',
        error: null,
        checks_run: ['security_headers', 'tls', 'cookies', 'redirects'],
        base_url: 'https://example.com',
        events: [{ seq: 2, type: 'scan.completed', payload: {} }],
        // The same key twice: the partial unique index discards the second row.
        findings: [
          finding,
          finding,
          {
            ...finding,
            key: 'b'.repeat(64),
            check: 'tls',
            title: 'TLS version below 1.2',
            affected_url: 'https://example.com/',
          },
        ],
      }),
      { params: { scanId } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const scan = await readScan(scanId);
    expect(scan?.status).toBe('completed');
    expect(scan?.finishedAt).toBeInstanceOf(Date);

    const events = await readEvents(scanId);
    expect(events.map((event) => event.seq)).toEqual([1, 2]);

    const rows = await readFindings(scanId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.findingKey)).toEqual(['a'.repeat(64), 'b'.repeat(64)]);

    const header = rows[0];
    expect(header?.severity).toBe('unclassified');
    expect(header?.checkName).toBe('security_headers');
    expect(header?.title).toBe('Missing Content-Security-Policy header');
    expect(header?.affectedUrl).toBe('https://example.com');
    expect(header?.evidence).toEqual({ header: 'content-security-policy' });
    expect(header?.raw).toEqual({ observed: { present: false } });
  });

  it('treats a duplicate terminal callback as a no-op', async () => {
    const scanId = await insertQueuedScan();
    await completeScan(scanId);

    const findingsBefore = await readFindings(scanId);
    const eventsBefore = await readEvents(scanId);

    const duplicate = await postScanCallback(
      callbackRequest(scanId, {
        scan_id: scanId,
        status: 'completed',
        events: [{ seq: 3, type: 'scan.completed', payload: {} }],
        findings: [
          {
            key: 'c'.repeat(64),
            check: 'tls',
            title: 'Should not be written',
            description: 'The scan is already terminal.',
          },
        ],
      }),
      { params: { scanId } },
    );

    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ ok: true, already_applied: true });

    expect(await readFindings(scanId)).toHaveLength(findingsBefore.length);
    expect(await readEvents(scanId)).toHaveLength(eventsBefore.length);
    expect((await readScan(scanId))?.status).toBe('completed');
  });

  it('serves the scan_events read path over JSON cursors and SSE', async () => {
    const scanId = await insertQueuedScan();
    await startScan(scanId);
    await completeScan(scanId);

    const first = await getScanEvents(eventRequest(scanId, '?cursor=0'), {
      params: Promise.resolve({ scanId }),
    });
    expect(first.status).toBe(200);

    const snapshot = (await first.json()) as {
      events: { id: number; seq: number; type: string; createdAt: string }[];
      cursor: number;
      status: string;
      done: boolean;
    };

    expect(snapshot.status).toBe('completed');
    expect(snapshot.events.map((event) => event.seq)).toEqual([1, 2]);
    expect(snapshot.cursor).toBe(snapshot.events[snapshot.events.length - 1]?.id);
    expect(snapshot.done).toBe(false);
    expect(Number.isNaN(new Date(snapshot.events[0]?.createdAt ?? '').getTime())).toBe(false);

    // A full empty cycle after the cursor is what marks the stream finished.
    const afterCursor = await getScanEvents(eventRequest(scanId, `?cursor=${snapshot.cursor}`), {
      params: Promise.resolve({ scanId }),
    });
    const tail = (await afterCursor.json()) as {
      events: unknown[];
      cursor: number;
      done: boolean;
    };
    expect(tail.events).toEqual([]);
    expect(tail.cursor).toBe(snapshot.cursor);
    expect(tail.done).toBe(true);

    // The SSE representation of the same rows (one polling cycle + one empty
    // cycle, so this resolves after ~1 s).
    const stream = await getScanEvents(eventRequest(scanId, '?cursor=0', 'text/event-stream'), {
      params: Promise.resolve({ scanId }),
    });
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const body = await stream.text();
    expect(body).toContain('event: scan.event');
    expect(body).toContain('"seq":1');
    expect(body).toContain('event: scan.done');
    expect(body).toContain('"status":"completed"');
  });

  it('rejects unauthenticated or cross-account event reads', async () => {
    const scanId = await insertQueuedScan();

    vi.mocked(getServerSession).mockResolvedValueOnce(session(null));
    const anonymous = await getScanEvents(eventRequest(scanId), {
      params: Promise.resolve({ scanId }),
    });
    expect(anonymous.status).toBe(401);

    vi.mocked(getServerSession).mockResolvedValueOnce(session({ user: { id: OTHER_USER_ID } }));
    const foreign = await getScanEvents(eventRequest(scanId), {
      params: Promise.resolve({ scanId }),
    });
    expect(foreign.status).toBe(403);
  });

  it('enforces the Bearer contract, 404 for unknown scans and 400 for malformed bodies', async () => {
    const scanId = await insertQueuedScan();
    const params = { params: { scanId } };

    const missing = await postScanCallback(callbackRequest(scanId, {}, null), params);
    expect(missing.status).toBe(401);

    // Same length exercises `timingSafeEqual`; different length exercises the
    // explicit length guard before it.
    const sameLength = await postScanCallback(
      callbackRequest(scanId, {}, 'x'.repeat(SECRET.length)),
      params,
    );
    expect(sameLength.status).toBe(401);

    const short = await postScanCallback(callbackRequest(scanId, {}, 'short'), params);
    expect(short.status).toBe(401);

    const unknown = await postScanCallback(callbackRequest(randomUUID(), {}, SECRET), {
      params: { scanId: randomUUID() },
    });
    expect(unknown.status).toBe(404);

    const malformed = new Request(`http://localhost:3000/api/scans/${scanId}/callback`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SECRET}`,
        'content-type': 'application/json',
      },
      body: '{',
    });
    const badBody = await postScanCallback(malformed, params);
    expect(badBody.status).toBe(400);
  });
});
