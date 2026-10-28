import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import {
  and,
  desc,
  eq,
  findings,
  ne,
  scans,
  scanEvents,
} from '@vuldetected/db';
import { NextResponse } from 'next/server';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { computeFindingKey } from '@/lib/findings/newness';
import { notifyScanCompleted } from '@/lib/mail/notify';
import { classifyFinding } from '@/lib/severity/classify';
import { owaspCategoryCodeFor } from '@/lib/severity/owasp';

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

export async function POST(req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    // Next 15 hands route params as a Promise. Reading `params.scanId` without
    // awaiting yields `undefined`, the scan lookup throws, and the handler
    // answers 400 for every terminal callback — the exact failure the E2E
    // suite reproduces.
    const { scanId } = await params;
    const env = getEnv();
    const expected = env.SCANNER_CALLBACK_SECRET;
    if (!expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = getBearerToken(req);
    if (!token || !timingSafeEqualBuffer(token, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        const current = await tx
          .select({ status: scans.status })
          .from(scans)
          .where(eq(scans.id, scanId))
          .limit(1);
        if (current[0]?.status === 'cancelled') return;

        /**
         * The previous completed scan of this domain, newest first.
         *
         * "New" is a comparison, so it needs the baseline at ingest time: the
         * next scan will compare against THIS one, and recomputing later would
         * rewrite history. A first scan has no baseline and therefore marks
         * every finding new.
         */
        const previousScanRows = await tx
          .select({ id: scans.id })
          .from(scans)
          .where(
            and(
              eq(scans.domainId, scan.domainId),
              ne(scans.id, scanId),
              eq(scans.status, 'completed'),
            ),
          )
          .orderBy(desc(scans.createdAt))
          .limit(1);

        const previousKeys = new Set<string>();
        if (previousScanRows[0]) {
          const previousFindings = await tx
            .select({ findingKey: findings.findingKey })
            .from(findings)
            .where(eq(findings.scanId, previousScanRows[0].id));
          for (const row of previousFindings) previousKeys.add(row.findingKey);
        }

        if (Array.isArray(body.findings)) {
          for (const f of body.findings) {
            if (!f) continue;
            const checkName = f.check;
            if (typeof checkName !== 'string' || checkName === '') continue;
            const evidence = f.evidence ?? {};
            const affectedUrl = f.affected_url ?? f.affectedUrl ?? body.base_url ?? '';

            /**
             * The worker sends the finished key. The fallback keeps an older or
             * partially upgraded worker from silently dropping findings: it
             * reproduces the same rule, with the finding title as discriminator
             * when the worker sent none.
             */
            const findingKey =
              typeof f.key === 'string' && f.key.trim() !== ''
                ? f.key
                : computeFindingKey({
                    domainId: scan.domainId,
                    checkName,
                    affectedUrl,
                    discriminator: evidence.header ?? f.title,
                  });

            const { severity } = classifyFinding(checkName, evidence, f.title ?? '');
            try {
              // Savepoint per row: without it, a single rejected INSERT marks
              // the surrounding transaction aborted and every later statement
              // fails with "current transaction is aborted" — which is how one
              // bad finding used to lose the whole batch.
              await tx.transaction(async (sp) => {
                await sp
                  .insert(findings)
                  .values({
                    scanId,
                    findingKey,
                    severity,
                    status: 'open',
                    owaspCategory: owaspCategoryCodeFor(checkName),
                    isNew: !previousKeys.has(findingKey),
                    checkName,
                    title: f.title,
                    description: f.description ?? '',
                    affectedUrl,
                    evidence,
                    raw: f.raw ?? {},
                  })
                  .onConflictDoNothing();
              });
            } catch {
              // A finding that cannot be persisted is skipped, but the batch
              // and the terminal status transition still commit.
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
          .where(and(eq(scans.id, scanId), ne(scans.status, 'cancelled')));
      });

      if (status === 'completed') {
        /**
         * Notifications and mail for a finished scan.
         *
         * Wrapped so a mail problem cannot turn a successful scan into a failed
         * callback: the worker would retry the whole terminal report, the scan
         * would flip to `failed` for a reason that has nothing to do with the
         * scan, and the findings would already be written. The outbox row is
         * what makes delivery retryable on its own schedule.
         */
        try {
          await notifyScanCompleted(scanId);
        } catch (error) {
          console.error('[mail] could not queue the scan notifications', error);
        }
      }

      try {
        if (status === 'completed') {
          await audit({
            action: 'scan.completed',
            targetType: 'scan',
            targetId: scanId,
          });
        } else {
          await audit({
            action: 'scan.failed',
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
