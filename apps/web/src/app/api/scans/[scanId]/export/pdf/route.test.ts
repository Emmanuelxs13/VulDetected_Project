import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dbQueue, resetDbMock } from '@test/db-mock';

import { GET } from './route';

/**
 * Route-level guarantees the layout tests cannot cover: who is allowed to
 * download the document and what the browser receives.
 *
 * ## WHY THE TRANSLATIONS ARE STUBBED TO THEIR KEYS
 *
 * The document's wording is asserted in `lib/reports/pdf.test.ts`, against the
 * real catalogues. Here the question is authorization and transport, so a stub
 * that echoes `namespace.key` keeps the test about the route. The route's
 * `t.has` probes then take their fallback branch, which is also worth covering:
 * a missing key must not throw while a user is downloading a report.
 */

const SCAN_ID = '11111111-1111-4111-8111-111111111111';

const session = vi.hoisted(() => ({ getServerSession: vi.fn() }));

vi.mock('@/lib/db', async () => {
  const { createDbMock } = await import('@test/db-mock');
  const dbMock = createDbMock();
  return { db: () => dbMock };
});

vi.mock('@/features/auth/session', () => ({
  getServerSession: session.getServerSession,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const translate = (key: string) => `${namespace}.${key}`;
    return Object.assign(translate, { has: () => false });
  },
}));

function request() {
  return new Request(`https://app.test/api/scans/${SCAN_ID}/export/pdf`);
}

function context(scanId = SCAN_ID) {
  return { params: Promise.resolve({ scanId }) };
}

const SCAN_ROW = {
  id: SCAN_ID,
  targetUrl: 'https://example.test/',
  status: 'completed',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  hostname: 'example.test',
};

const FINDING_ROW = {
  severity: 'high' as const,
  status: 'open' as const,
  checkName: 'security_headers',
  title: 'Missing HSTS header',
  description: 'The response does not send Strict-Transport-Security.',
  affectedUrl: 'https://example.test/',
  evidence: { header: 'strict-transport-security' },
  owaspCategory: 'A05',
};

beforeEach(() => {
  resetDbMock();
  vi.clearAllMocks();
  session.getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('GET /api/scans/[scanId]/export/pdf', () => {
  it('answers 401 and reads nothing when there is no session', async () => {
    session.getServerSession.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    // Nothing was queried: an anonymous request must not reach the database.
    expect(dbQueue.length).toBe(0);
  });

  it('answers 404 for a scan that is not reachable through the caller domains', async () => {
    // The ownership join returned no row: the scan belongs to another account,
    // or does not exist. Both are the same answer, so an id cannot be probed.
    dbQueue.push([]);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('serves a PDF for the owning account with download-safe headers', async () => {
    dbQueue.push([SCAN_ROW]);
    dbQueue.push([FINDING_ROW]);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="vuldetected-example.test-${SCAN_ID.slice(0, 8)}.pdf"`,
    );
    // The document carries the account's own findings: no shared cache may keep it.
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('renders a scan with no findings instead of failing', async () => {
    dbQueue.push([SCAN_ROW]);
    dbQueue.push([]);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()).slice(0, 5))).toBe(
      '%PDF-',
    );
  });
});
