import 'server-only';

import { and, domains, eq, findings, scans } from '@vuldetected/db';
import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';
import { classifyFinding } from '@/lib/severity/classify';

export const dynamic = 'force-dynamic';

function formatDate(d: Date) {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export async function GET(_req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scanRows = await db()
    .select({
      scan: scans,
      hostname: domains.normalizedHostname,
    })
    .from(scans)
    .innerJoin(domains, eq(scans.domainId, domains.id))
    .where(and(eq(scans.id, scanId), eq(domains.userId, session.user.id)))
    .limit(1);

  if (scanRows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const scan = scanRows[0]?.scan;
  const hostname = scanRows[0]?.hostname;
  if (!scan || !hostname) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const findingRows = await db()
    .select({
      severity: findings.severity,
      checkName: findings.checkName,
      title: findings.title,
      description: findings.description,
      affectedUrl: findings.affectedUrl,
      evidence: findings.evidence,
    })
    .from(findings)
    .where(eq(findings.scanId, scanId))
    .orderBy(findings.createdAt);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 60;
  const margin = 50;
  const line = 16;

  const draw = (text: string, size = 10, bold = false, x = margin) => {
    page.drawText(text.length > 110 ? text.slice(0, 107) + '...' : text, {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0, 0, 0),
    });
    y -= line;
  };

  draw('VulDetected - Executive Report', 18, true);
  y -= 4;
  draw(`Domain: ${hostname}`, 10);
  draw(`Target: ${scan.targetUrl}`, 10);
  draw(`Scan ID: ${scan.id}`, 10);
  draw(`Status: ${scan.status}`, 10);
  draw(`Created: ${formatDate(scan.createdAt)}`, 10);
  draw(`Generated: ${formatDate(new Date())}`, 10);
  y -= 10;

  // Severity breakdown
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, unclassified: 0 } as Record<
    string,
    number
  >;
  for (const f of findingRows) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }
  draw('Severity breakdown', 14, true);
  draw(
    `Critical: ${counts.critical} | High: ${counts.high} | Medium: ${counts.medium} | Low: ${counts.low} | Info: ${counts.info} | Unclassified: ${counts.unclassified}`,
    10,
  );
  y -= 10;

  draw(`Total findings: ${findingRows.length}`, 12, true);
  y -= 6;

  if (findingRows.length === 0) {
    draw('No findings recorded for this scan.', 10);
  } else {
    // Critical and High first
    const criticalHigh = findingRows.filter(
      (f) => f.severity === 'critical' || f.severity === 'high',
    );
    if (criticalHigh.length > 0) {
      draw('Critical / High findings', 14, true);
      for (const f of criticalHigh) {
        if (y < 80) break;
        const cls = classifyFinding(
          f.checkName,
          (f.evidence ?? {}) as Record<string, unknown>,
          f.title,
        );
        draw(`[${f.severity.toUpperCase()}] ${f.title}`, 11, true);
        draw(`Affected: ${f.affectedUrl}`, 9);
        draw(`Rule: ${cls.rationale} (check: ${f.checkName})`, 9);
        draw(`Description: ${f.description}`, 9);
        y -= 4;
      }
      y -= 6;
    }

    draw('All findings', 14, true);
    for (const f of findingRows) {
      if (y < 60) break;
      const cls = classifyFinding(
        f.checkName,
        (f.evidence ?? {}) as Record<string, unknown>,
        f.title,
      );
      draw(`[${f.severity.toUpperCase()}] ${f.title} - ${f.affectedUrl}`, 9);
      draw(`Rule: ${cls.rationale}`, 8);
      y -= 2;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `vuldetected-scan-${scan.id.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
