import 'server-only';

import { and, desc, domains, eq, findings, inArray, lt, or, scans, sql } from '@vuldetected/db';
import type { Severity } from '@vuldetected/db';

import type { FindingRow } from '@/features/scans/components/findings-list';
import { db } from '@/lib/db';

/** Default page size. A domain can hold tens of thousands of findings, so every read is paged. */
export const FINDINGS_PAGE_SIZE = 50;

const SEVERITIES: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'unclassified',
];

export interface FindingsPageQuery {
  ownerUserId: string;
  scanId?: string;
  severity?: string;
  cursor?: string;
  limit?: number;
}

export interface FindingsPage {
  rows: FindingRow[];
  nextCursor: string | null;
}

/**
 * Keyset cursor over `(created_at, id)`.
 *
 * `created_at` alone is not unique: findings of one scan are inserted in the same
 * transaction and can share a timestamp, which would drop or repeat a row at a
 * page boundary. The id breaks the tie.
 */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
  if (!raw) {
    return null;
  }

  try {
    const [iso, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!iso || !id) {
      return null;
    }

    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, id };
  } catch {
    return null;
  }
}

function normalizeSeverity(raw: string | undefined): Severity | null {
  if (!raw || raw === 'all') {
    return null;
  }

  return SEVERITIES.includes(raw as Severity) ? (raw as Severity) : null;
}

/**
 * One page of findings, always scoped to the account that owns the domain.
 *
 * The owner join is not optional: a scan id is not a secret, so the read has to
 * prove the same ownership link the write did.
 */
export async function listFindingsPage(query: FindingsPageQuery): Promise<FindingsPage> {
  const limit = Math.min(Math.max(query.limit ?? FINDINGS_PAGE_SIZE, 1), 200);
  const cursor = decodeCursor(query.cursor);
  const severity = normalizeSeverity(query.severity);

  const conditions = [eq(domains.userId, query.ownerUserId)];
  if (query.scanId) {
    conditions.push(eq(findings.scanId, query.scanId));
  }
  if (severity) {
    conditions.push(eq(findings.severity, severity));
  }
  if (cursor) {
    conditions.push(
      or(
        lt(findings.createdAt, cursor.createdAt),
        and(eq(findings.createdAt, cursor.createdAt), lt(findings.id, cursor.id)),
      )!,
    );
  }

  const rows = await db()
    .select({
      id: findings.id,
      severity: findings.severity,
      status: findings.status,
      checkName: findings.checkName,
      title: findings.title,
      description: findings.description,
      affectedUrl: findings.affectedUrl,
      scanId: findings.scanId,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(...conditions))
    .orderBy(desc(findings.createdAt), desc(findings.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    rows: page.map((row) => ({
      id: row.id,
      severity: row.severity,
      status: row.status,
      checkName: row.checkName,
      title: row.title,
      description: row.description,
      affectedUrl: row.affectedUrl,
      scanId: row.scanId,
    })),
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export type SeverityCounts = Record<Severity, number>;

/** Total findings per severity for one account, computed in the database (bounded: at most 6 rows). */
export async function getSeverityCounts(
  ownerUserId: string,
  scanId?: string,
): Promise<{ counts: SeverityCounts; total: number }> {
  const conditions = [eq(domains.userId, ownerUserId), eq(findings.status, 'open')];
  if (scanId) {
    conditions.push(eq(findings.scanId, scanId));
  }

  const rows = await db()
    .select({ severity: findings.severity, total: sql<number>`count(*)::int` })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(...conditions))
    .groupBy(findings.severity);

  const counts: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    unclassified: 0,
  };
  let total = 0;
  for (const row of rows) {
    counts[row.severity] = row.total;
    total += row.total;
  }

  return { counts, total };
}

export interface PostureTrend {
  hostname: string;
  latestScanId: string;
  latestAt: Date;
  latestRisky: number;
  previousRisky: number | null;
  delta: number | null;
}

/**
 * Posture trend per domain: high+critical findings in the newest completed scan
 * compared with the one before it.
 *
 * Bounded on purpose: the newest 40 completed scans of the account, and one
 * grouped count over their ids. Nothing here scales with the number of findings.
 */
export async function getDomainPostureTrends(ownerUserId: string): Promise<PostureTrend[]> {
  const recentScans = await db()
    .select({
      id: scans.id,
      domainId: scans.domainId,
      hostname: domains.normalizedHostname,
      createdAt: scans.createdAt,
    })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(domains.userId, ownerUserId), eq(scans.status, 'completed')))
    .orderBy(desc(scans.createdAt))
    .limit(40);

  if (recentScans.length === 0) {
    return [];
  }

  const byDomain = new Map<string, typeof recentScans>();
  for (const scan of recentScans) {
    const list = byDomain.get(scan.domainId) ?? [];
    if (list.length < 2) {
      list.push(scan);
      byDomain.set(scan.domainId, list);
    }
  }

  const scanIds = [...byDomain.values()].flat().map((scan) => scan.id);
  const riskyRows = await db()
    .select({ scanId: findings.scanId, total: sql<number>`count(*)::int` })
    .from(findings)
    .where(
      and(
        inArray(findings.scanId, scanIds),
        inArray(findings.severity, ['critical', 'high']),
        // Only open findings count. The dashboard light uses the same rule, and
        // the whole point of the trend is "did my fix work": if a finding the
        // user resolved still counted as risky, fixing it would never move the
        // line and the two numbers on the same screen would disagree.
        eq(findings.status, 'open'),
      ),
    )
    .groupBy(findings.scanId);

  const riskyByScan = new Map(riskyRows.map((row) => [row.scanId, row.total]));

  const trends: PostureTrend[] = [];
  for (const list of byDomain.values()) {
    const [latest, previous] = list;
    if (!latest) {
      continue;
    }
    const latestRisky = riskyByScan.get(latest.id) ?? 0;
    const previousRisky = previous ? (riskyByScan.get(previous.id) ?? 0) : null;

    trends.push({
      hostname: latest.hostname,
      latestScanId: latest.id,
      latestAt: latest.createdAt,
      latestRisky,
      previousRisky,
      delta: previousRisky === null ? null : latestRisky - previousRisky,
    });
  }

  return trends.sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
}
