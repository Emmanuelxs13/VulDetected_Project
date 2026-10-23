import 'server-only';

import { and, domains, eq, findings, scans } from '@vuldetected/db';
import { NextResponse } from 'next/server';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scanRows = await db()
    .select({ id: scans.id })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(scans.id, scanId), eq(domains.userId, session.user.id)))
    .limit(1);

  if (scanRows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const findingRows = await db()
    .select({
      severity: findings.severity,
      checkName: findings.checkName,
      title: findings.title,
      description: findings.description,
      affectedUrl: findings.affectedUrl,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .where(eq(findings.scanId, scanId))
    .orderBy(findings.createdAt);

  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'csv';

  if (format === 'json') {
    const body = JSON.stringify(
      { scanId, exportedAt: new Date().toISOString(), findings: findingRows },
      null,
      2,
    );
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="scan-' + scanId + '.json"',
      },
    });
  }

  const header = ['severity', 'check', 'title', 'description', 'affected_url', 'created_at'].join(
    ',',
  );
  const lines = findingRows.map((f) =>
    [
      csvEscape(f.severity),
      csvEscape(f.checkName),
      csvEscape(f.title),
      csvEscape(f.description),
      csvEscape(f.affectedUrl),
      csvEscape(f.createdAt.toISOString()),
    ].join(','),
  );
  const csv = [header, ...lines].join('\n') + '\n';

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="scan-' + scanId + '.csv"',
    },
  });
}
