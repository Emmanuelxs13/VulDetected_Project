import 'server-only';

import { and, desc, domains, eq, findings, inArray, scans, sql } from '@vuldetected/db';
import type { Severity } from '@vuldetected/db';

import { db } from '@/lib/db';
import {
  buildHistoryRows,
  emptySeverityCounts,
  type HistoryRow,
  type ScanSnapshotInput,
  type SeverityCounts,
} from '@/lib/history/comparability';

/**
 * The comparative history of one domain (HU-10).
 *
 * ## Bounded reads
 *
 * At most `HISTORY_LIMIT` scans and one grouped count over their ids. Nothing
 * here scales with the number of findings: a domain with 40,000 findings costs
 * the same six grouped rows as one with forty.
 *
 * ## Ownership
 *
 * The domain is resolved through the account that owns it, so a domain id
 * guessed from a URL returns `null` instead of a history. A domain id is not a
 * secret either.
 */

export const HISTORY_LIMIT = 50;

export interface DomainHistory {
  domainId: string;
  hostname: string;
  rows: HistoryRow[];
}

export async function getDomainScanHistory(
  ownerUserId: string,
  domainId: string,
): Promise<DomainHistory | null> {
  const domainRows = await db()
    .select({ id: domains.id, hostname: domains.normalizedHostname })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.userId, ownerUserId)))
    .limit(1);

  const domain = domainRows[0];
  if (!domain) {
    return null;
  }

  const scanRows = await db()
    .select({
      id: scans.id,
      createdAt: scans.createdAt,
      status: scans.status,
      partial: scans.partial,
      isDemo: scans.isDemo,
      scanMode: scans.scanMode,
      severityCatalogVersion: scans.severityCatalogVersion,
    })
    .from(scans)
    .where(eq(scans.domainId, domain.id))
    .orderBy(desc(scans.createdAt))
    .limit(HISTORY_LIMIT);

  if (scanRows.length === 0) {
    return { domainId: domain.id, hostname: domain.hostname, rows: [] };
  }

  const scanIds = scanRows.map((scan) => scan.id);

  const countRows = await db()
    .select({
      scanId: findings.scanId,
      severity: findings.severity,
      total: sql<number>`count(*)::int`,
    })
    .from(findings)
    .where(
      and(
        inArray(findings.scanId, scanIds),
        // Only open findings describe the site as it is now. A resolved finding
        // is history, and counting it would make a fix look like a regression.
        eq(findings.status, 'open'),
      ),
    )
    .groupBy(findings.scanId, findings.severity);

  const countsByScan = new Map<string, SeverityCounts>();
  for (const row of countRows) {
    const counts = countsByScan.get(row.scanId) ?? emptySeverityCounts();
    counts[row.severity as Severity] = row.total;
    countsByScan.set(row.scanId, counts);
  }

  const snapshots: ScanSnapshotInput[] = scanRows.map((scan) => ({
    scanId: scan.id,
    createdAt: scan.createdAt,
    status: scan.status,
    partial: scan.partial,
    isDemo: scan.isDemo,
    scanMode: scan.scanMode as ScanSnapshotInput['scanMode'],
    severityCatalogVersion: scan.severityCatalogVersion,
    counts: countsByScan.get(scan.id) ?? emptySeverityCounts(),
  }));

  return { domainId: domain.id, hostname: domain.hostname, rows: buildHistoryRows(snapshots) };
}
