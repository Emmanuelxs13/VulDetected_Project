import 'server-only';

import { and, eq, gt } from '@vuldetected/db';
import { domains, scanEvents, scans } from '@vuldetected/db';
import { NextResponse } from 'next/server';

import { getServerSession } from '@/features/auth/session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Poll cadence and heartbeat for the live stream (design D7).
 *
 * The browser is told about new events within one polling cycle, which is the
 * ≤2 s budget of SP-3. The heartbeat exists so an idle connection is not
 * mistaken for a dead one by a proxy in between.
 */
const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

/** Volume cap per cycle (design D7): 100 events, 1 cycle per second. */
const MAX_EVENTS_PER_CYCLE = 100;

/** One row of `scan_events`, shaped for the wire. */
interface StreamEvent {
  id: number;
  seq: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

/**
 * Live progress for one scan.
 *
 * ## TWO TRANSPORTS, ONE AUTHORITY
 *
 * The same endpoint serves two representations of the same data:
 *
 *   - `Accept: text/event-stream` → an SSE stream (what the browser uses).
 *     The browser cannot poll on its own without a second request per second
 *     and a cursor it would have to thread by hand.
 *   - anything else → the JSON snapshot, kept for scripted consumers and for
 *     the tests that assert the cursor contract.
 *
 * Both read the same append-only table through the same polling helper, so
 * neither can drift from the other. `scan_events` stays the single authority:
 * the web app is the only writer (SP-2), and this route only reads.
 */
export async function GET(req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const { scanId } = await params;

    /*
     * An API route answers 401, it never redirects to the login page. A
     * redirect would send an `EventSource` to an HTML document, which the
     * browser then fails to parse as an event stream.
     */
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const owned = await db()
      .select({ ownerId: domains.userId })
      .from(scans)
      .leftJoin(domains, eq(scans.domainId, domains.id))
      .where(eq(scans.id, scanId))
      .limit(1);

    if (owned.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (owned[0]?.ownerId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const cursor = Number.parseInt(url.searchParams.get('cursor') ?? '0', 10);
    const afterId = Number.isNaN(cursor) ? 0 : cursor;

    if ((req.headers.get('accept') ?? '').includes('text/event-stream')) {
      return streamScanEvents(req, scanId, afterId);
    }

    const { events, cursor: lastId, status, done } = await pollScanEvents(scanId, afterId);
    return NextResponse.json({ events, cursor: lastId, status, done });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

/**
 * Reads one polling cycle: the current status plus the events after the cursor.
 *
 * The status is read BEFORE the events on purpose. A terminal status is only
 * believed once a full cycle comes back empty, so the final `scan.completed`
 * event is always delivered before the stream closes.
 */
async function pollScanEvents(scanId: string, afterId: number) {
  const statusRows = await db()
    .select({ status: scans.status })
    .from(scans)
    .where(eq(scans.id, scanId))
    .limit(1);

  const status = statusRows[0]?.status ?? 'failed';

  const rows = await db()
    .select({
      id: scanEvents.id,
      seq: scanEvents.seq,
      type: scanEvents.type,
      payload: scanEvents.payload,
      createdAt: scanEvents.createdAt,
    })
    .from(scanEvents)
    .where(and(eq(scanEvents.scanId, scanId), gt(scanEvents.id, afterId)))
    .orderBy(scanEvents.id)
    .limit(MAX_EVENTS_PER_CYCLE);

  const events: StreamEvent[] = rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    type: row.type,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  }));

  const lastId = events.length > 0 ? events[events.length - 1]!.id : afterId;
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';

  return { events, cursor: lastId, status, done: terminal && events.length === 0 };
}

/**
 * The SSE stream.
 *
 * A native `ReadableStream`, no library (design D7). Each cycle appends the
 * events after the cursor and advances it; the stream closes once the scan is
 * terminal and a cycle brings nothing new. A `: ping` comment every 15 s keeps
 * the connection alive through intermediaries without polluting the event feed.
 */
function streamScanEvents(req: Request, scanId: string, afterId: number): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The browser resumes a dropped connection with `Last-Event-ID`; the
      // explicit `cursor` query parameter is the fallback for a first request.
      const lastEventId = Number.parseInt(req.headers.get('last-event-id') ?? '0', 10);
      let cursor = Math.max(afterId, Number.isNaN(lastEventId) ? 0 : lastEventId);
      let lastBeat = Date.now();

      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      try {
        for (;;) {
          if (req.signal.aborted) {
            break;
          }

          const { events, cursor: nextCursor, status, done } = await pollScanEvents(scanId, cursor);
          cursor = nextCursor;

          for (const event of events) {
            send(`id: ${event.id}\nevent: scan.event\ndata: ${JSON.stringify(event)}\n\n`);
          }

          const now = Date.now();
          if (events.length > 0) {
            lastBeat = now;
          } else if (now - lastBeat >= HEARTBEAT_INTERVAL_MS) {
            send(': ping\n\n');
            lastBeat = now;
          }

          if (done) {
            send(`event: scan.done\ndata: ${JSON.stringify({ status })}\n\n`);
            break;
          }

          await sleep(POLL_INTERVAL_MS);
        }
      } catch {
        // The client disconnected or the database failed: end the stream. The
        // browser reconnects on its own and resumes from the last event id.
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the abort path.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Tells reverse proxies not to buffer the stream, which would defeat the
      // point of streaming it.
      'x-accel-buffering': 'no',
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
