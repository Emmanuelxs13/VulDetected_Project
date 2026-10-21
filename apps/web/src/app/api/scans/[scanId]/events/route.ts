import 'server-only';

import { and, eq, gt } from '@vuldetected/db';
import { domains, scanEvents, scans } from '@vuldetected/db';
import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { scanId: string } }) {
  try {
    const { userId } = await requireUser();
    const scanId = params.scanId;

    const result = await db()
      .select({ domainUserId: domains.userId, status: scans.status })
      .from(scans)
      .leftJoin(domains, eq(scans.domainId, domains.id))
      .where(eq(scans.id, scanId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if ((result[0] as { domainUserId: string | null }).domainUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const cursor = parseInt(url.searchParams.get('cursor') || '0', 10);
    const afterId = isNaN(cursor) ? 0 : cursor;

    const events = await db()
      .select()
      .from(scanEvents)
      .where(and(eq(scanEvents.scanId, scanId), gt(scanEvents.id, afterId)))
      .orderBy(scanEvents.id)
      .limit(100);

    const lastId = events.length > 0 ? (events[events.length - 1] as { id: number }).id : afterId;
    const status = (result[0] as { status: string }).status;
    const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled';

    return NextResponse.json({
      events: events.map(
        (e: { id: number; seq: number; type: string; payload: unknown; createdAt: Date }) => ({
          id: e.id,
          seq: e.seq,
          type: e.type,
          payload: e.payload,
          createdAt: e.createdAt,
        }),
      ),
      cursor: lastId,
      status,
      done: isTerminal && events.length === 0,
    });
  } catch (err: unknown) {
    if (
      (err as { name?: string })?.name === 'UnauthorizedError' ||
      (err as Error)?.message === 'Unauthorized'
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
