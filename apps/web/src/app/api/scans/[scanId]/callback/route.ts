import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { eq, findings, scans, scanEvents } from '@vuldetected/db';
import { NextResponse } from 'next/server';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

function timingSafeEqualBuffer(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7);
  }
  return null;
}

export async function POST(req: Request, { params }: { params: { scanId: string } }) {
  try {
    const env = getEnv();
    const expected = env.SCANNER_CALLBACK_SECRET;
    if (!expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = getBearerToken(req);
    if (!token || !timingSafeEqualBuffer(token, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scanId = params.scanId;
    const body = await req.json();

    const scanRows = await db().select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (scanRows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const scan = scanRows[0];
    if (!scan) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (scan.status === 'completed' || scan.status === 'failed' || scan.status === 'cancelled') {
      return NextResponse.json({ ok: true, already_applied: true });
    }

    // Handle events
    if (Array.isArray(body.events)) {
      for (const ev of body.events) {
        if (!ev || typeof ev.seq !== 'number') continue;
        try {
          await db()
            .insert(scanEvents)
            .values({
              scanId,
              seq: ev.seq,
              type: ev.type,
              payload: ev.payload ?? {},
            })
            .onConflictDoNothing();
        } catch (_ignore) {
          void _ignore;
          // ignore
        }
        if (ev.type === 'scan.started') {
          try {
            await db()
              .update(scans)
              .set({ status: 'running', startedAt: scan.startedAt ?? new Date() })
              .where(eq(scans.id, scanId));
          } catch {
            const _e: unknown = undefined;
            void _e;

            // ignore
          }
        }
      }
    }

    const status = body.status;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      await db().transaction(async (tx) => {
        if (Array.isArray(body.findings)) {
          for (const f of body.findings) {
            if (!f || !f.key) continue;
            try {
              await tx
                .insert(findings)
                .values({
                  scanId,
                  findingKey: f.key,
                  severity: 'unclassified',
                  checkName: f.check,
                  title: f.title,
                  description: f.description ?? '',
                  affectedUrl: f.affected_url ?? f.affectedUrl ?? body.base_url ?? '',
                  evidence: f.evidence ?? {},
                  raw: f.raw ?? {},
                })
                .onConflictDoNothing();
            } catch {
              const _err: unknown = undefined;
              void _err;

              // ignore
            }
          }
        }

        const update: Record<string, unknown> = {
          status,
          finishedAt: new Date(),
        };
        if (body.error) {
          (update as { error?: unknown }).error = body.error;
        }
        await tx
          .update(scans)
          .set(update as unknown as Record<string, Date | string>)
          .where(eq(scans.id, scanId));
      });

      try {
        if (status === 'completed') {
          await audit({
            action: 'scan.completed' as unknown as import('@/lib/audit').AuditAction,
            targetType: 'scan',
            targetId: scanId,
          });
        } else {
          await audit({
            action: 'scan.failed' as unknown as import('@/lib/audit').AuditAction,
            targetType: 'scan',
            targetId: scanId,
          });
        }
      } catch {
        // ignore
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
